"use client";

/**
 * Recruiter MCQ generator — implements the three flows described in the
 * design:
 *   1. From a suggested JD (flow A)
 *   2. Upload / paste the recruiter's own JD (flow B)
 *   3. Upload / paste a JD + a candidate resume (flow C)
 *
 * For flows B and C, the backend first classifies the JD as structured vs
 * unstructured. If unstructured, a synthesized pseudo-JD is returned and the
 * recruiter is asked to confirm/edit it before the actual question
 * generation step runs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Upload, FileText, Wand2, CheckCircle2, XCircle, Pencil, Trash2, Rocket, Copy, Check } from "lucide-react";

type Mode = "suggested" | "own_jd" | "jd_resume";

interface SuggestedJD {
    title: string;
    description: string;
    responsibilities: string[];
    skills: string[];
}

interface SynthesizedJD {
    title: string;
    description: string;
    responsibilities: string[];
    required_skills: string[];
    nice_to_have?: string[];
}

interface WeightedSkill {
    skill: string;
    weight: number;
}

interface GeneratedQuestion {
    type: "mcq" | "code" | "text";
    skill: string;
    difficulty: string;
    bloom_level: string;
    question: string;
    options?: string[];
    correct_index?: number;
    language?: string;
    starter_code?: string;
    expected_solution?: string;
    expected_answer?: string;
    rationale?: string;
}

interface GenerationRecord {
    id: number;
    status: string;
    jd_type?: string;
    jd_text?: string;
    synthesized_jd?: SynthesizedJD;
    extracted_skills?: { name: string; importance: number }[];
    weighted_skills?: WeightedSkill[];
    questions?: GeneratedQuestion[];
    validator_report?: { ok: boolean; issues: string[]; missing_skills: string[] };
    error?: string;
}

const STATUS_LABEL: Record<string, string> = {
    pending: "Starting…",
    parsing: "Reading document…",
    classifying: "Analysing JD…",
    synthesizing: "Drafting JD from skills…",
    awaiting_confirmation: "Awaiting your confirmation",
    extracting_skills: "Extracting skills…",
    generating: "Generating questions…",
    validating: "Validating questions…",
    done: "Done",
    failed: "Failed",
};

const TERMINAL = ["done", "failed", "awaiting_confirmation"];

interface Props {
    orgId: number;
    suggestedJDs: SuggestedJD[];
}

export default function RecruiterMCQGenerator({ orgId, suggestedJDs }: Props) {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL;

    const [mode, setMode] = useState<Mode>("suggested");
    const [numQuestions, setNumQuestions] = useState(10);
    const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
    const [mcqCount, setMcqCount] = useState(6);
    const [codeCount, setCodeCount] = useState(2);
    const [textCount, setTextCount] = useState(2);

    // Flow A
    const [selectedJDIdx, setSelectedJDIdx] = useState<number | null>(null);

    // Flow B/C inputs
    const [jdTextInput, setJdTextInput] = useState("");
    const [jdFile, setJdFile] = useState<File | null>(null);
    const [resumeTextInput, setResumeTextInput] = useState("");
    const [resumeFile, setResumeFile] = useState<File | null>(null);

    // Generation state
    const [genId, setGenId] = useState<number | null>(null);
    const [record, setRecord] = useState<GenerationRecord | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Editable synthesized JD (for confirmation step)
    const [editableJD, setEditableJD] = useState<SynthesizedJD | null>(null);

    // Editable question list (populated once generation is done)
    const [editableQuestions, setEditableQuestions] = useState<GeneratedQuestion[] | null>(null);

    // Publish state
    const [publishTitle, setPublishTitle] = useState("");
    const [publishing, setPublishing] = useState(false);
    const [publishedTest, setPublishedTest] = useState<{ id: number; test_code: string; title: string; question_count: number } | null>(null);
    const [copied, setCopied] = useState(false);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const pollOnce = useCallback(async (id: number) => {
        try {
            const res = await fetch(`${backend}/recruiter/mcq/${id}`);
            if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
            const data: GenerationRecord = await res.json();
            setRecord(data);
            if (data.status === "awaiting_confirmation" && data.synthesized_jd) {
                setEditableJD(data.synthesized_jd);
            }
            // Seed editable questions once the generation finishes so recruiter can modify
            if (data.status === "done" && data.questions && editableQuestions === null) {
                setEditableQuestions(data.questions);
                if (!publishTitle) {
                    setPublishTitle(data.synthesized_jd?.title || "Recruiter Assessment");
                }
            }
            if (TERMINAL.includes(data.status)) {
                stopPolling();
            }
        } catch (e: any) {
            setErrorMsg(e?.message || "Polling error");
            stopPolling();
        }
    }, [backend, stopPolling, editableQuestions, publishTitle]);

    useEffect(() => {
        if (!genId) return;
        stopPolling();
        pollOnce(genId);
        pollRef.current = setInterval(() => pollOnce(genId), 2000);
        return stopPolling;
    }, [genId, pollOnce, stopPolling]);

    const resetGeneration = () => {
        stopPolling();
        setGenId(null);
        setRecord(null);
        setEditableJD(null);
        setEditableQuestions(null);
        setPublishedTest(null);
        setPublishTitle("");
        setErrorMsg(null);
    };

    // ---- Edit / delete / publish ----
    const saveEditedQuestions = async (questions: GeneratedQuestion[]) => {
        setEditableQuestions(questions);
        if (!genId) return;
        try {
            await fetch(`${backend}/recruiter/mcq/${genId}/questions`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ questions }),
            });
        } catch (e) {
            // Non-fatal — the recruiter can still publish from the local list
            console.error("Failed to sync questions", e);
        }
    };

    const publishTest = async () => {
        if (!genId || !editableQuestions || editableQuestions.length === 0) return;
        if (!publishTitle.trim()) {
            setErrorMsg("Give the test a title before publishing");
            return;
        }
        setPublishing(true);
        setErrorMsg(null);
        try {
            const res = await fetch(`${backend}/recruiter/mcq/${genId}/publish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: publishTitle.trim(),
                    questions: editableQuestions,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.detail || `Publish failed: ${res.status}`);
            }
            const data = await res.json();
            setPublishedTest(data);
        } catch (e: any) {
            setErrorMsg(e?.message || "Failed to publish");
        } finally {
            setPublishing(false);
        }
    };

    const copyCode = async () => {
        if (!publishedTest) return;
        try {
            await navigator.clipboard.writeText(publishedTest.test_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { }
    };

    const typeMix = () => ({
        mcq: mcqCount,
        code: codeCount,
        text: textCount,
    });

    // ---- Flow A ----
    const startSuggested = async () => {
        if (selectedJDIdx === null) {
            setErrorMsg("Select a suggested JD first");
            return;
        }
        const jd = suggestedJDs[selectedJDIdx];
        setSubmitting(true);
        setErrorMsg(null);
        try {
            const res = await fetch(`${backend}/recruiter/mcq/from-suggested`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    org_id: orgId,
                    jd_title: jd.title,
                    jd_description: jd.description,
                    jd_responsibilities: jd.responsibilities,
                    jd_skills: jd.skills,
                    num_questions: numQuestions,
                    difficulty,
                    type_mix: typeMix(),
                }),
            });
            if (!res.ok) throw new Error(`Failed: ${res.status}`);
            const data = await res.json();
            setGenId(data.id);
        } catch (e: any) {
            setErrorMsg(e?.message || "Failed to start");
        } finally {
            setSubmitting(false);
        }
    };

    // ---- Flow B ----
    const startOwnJD = async () => {
        if (!jdFile && !jdTextInput.trim()) {
            setErrorMsg("Upload a JD file or paste JD text");
            return;
        }
        setSubmitting(true);
        setErrorMsg(null);
        try {
            const form = new FormData();
            form.append("org_id", String(orgId));
            if (jdTextInput.trim()) form.append("jd_text", jdTextInput);
            if (jdFile) form.append("jd_file", jdFile);
            const res = await fetch(`${backend}/recruiter/mcq/from-own-jd`, {
                method: "POST",
                body: form,
            });
            if (!res.ok) throw new Error(`Failed: ${res.status}`);
            const data = await res.json();
            setGenId(data.id);
        } catch (e: any) {
            setErrorMsg(e?.message || "Failed to start");
        } finally {
            setSubmitting(false);
        }
    };

    // ---- Flow C ----
    const startJDResume = async () => {
        if ((!jdFile && !jdTextInput.trim()) || (!resumeFile && !resumeTextInput.trim())) {
            setErrorMsg("Provide both JD and resume (file or text)");
            return;
        }
        setSubmitting(true);
        setErrorMsg(null);
        try {
            const form = new FormData();
            form.append("org_id", String(orgId));
            if (jdTextInput.trim()) form.append("jd_text", jdTextInput);
            if (jdFile) form.append("jd_file", jdFile);
            if (resumeTextInput.trim()) form.append("resume_text", resumeTextInput);
            if (resumeFile) form.append("resume_file", resumeFile);
            const res = await fetch(`${backend}/recruiter/mcq/from-jd-resume`, {
                method: "POST",
                body: form,
            });
            if (!res.ok) throw new Error(`Failed: ${res.status}`);
            const data = await res.json();
            setGenId(data.id);
        } catch (e: any) {
            setErrorMsg(e?.message || "Failed to start");
        } finally {
            setSubmitting(false);
        }
    };

    const startByMode = () => {
        if (mode === "suggested") return startSuggested();
        if (mode === "own_jd") return startOwnJD();
        return startJDResume();
    };

    // ---- Confirm (synthesized or structured) JD and kick off generation ----
    const confirmAndGenerate = async () => {
        if (!genId) return;
        setSubmitting(true);
        setErrorMsg(null);
        try {
            const body: any = {
                num_questions: numQuestions,
                difficulty,
                type_mix: typeMix(),
            };
            // Only include the editable JD for the unstructured path.
            if (record?.jd_type === "unstructured" && editableJD) {
                body.jd = editableJD;
            }
            const res = await fetch(`${backend}/recruiter/mcq/${genId}/confirm`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(`Failed: ${res.status}`);
            // Restart polling
            pollOnce(genId);
            pollRef.current = setInterval(() => pollOnce(genId), 2000);
        } catch (e: any) {
            setErrorMsg(e?.message || "Failed to confirm");
        } finally {
            setSubmitting(false);
        }
    };

    const statusLabel = record ? STATUS_LABEL[record.status] || record.status : null;

    return (
        <div className="mt-10">
            <div className="flex items-center mb-4">
                <Wand2 size={20} className="mr-2 text-purple-600 dark:text-purple-400" />
                <h3 className="text-xl font-light text-black dark:text-white">
                    Generate Assessment Questions
                </h3>
                <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
                    MCQ, code, and text questions tailored to a JD
                </span>
            </div>

            {/* Mode picker */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {([
                    { id: "suggested", title: "From Suggested JD", desc: "Pick one of the JDs generated from your courses" },
                    { id: "own_jd", title: "Upload Own JD", desc: "Paste or upload your own JD (PDF/DOCX/text)" },
                    { id: "jd_resume", title: "JD + Resume", desc: "Generate questions targeted at a specific candidate" },
                ] as const).map((m) => (
                    <button
                        key={m.id}
                        onClick={() => { setMode(m.id); resetGeneration(); }}
                        className={`text-left rounded-xl border p-4 transition-colors ${mode === m.id
                            ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-purple-400"
                            }`}
                    >
                        <div className="font-medium text-black dark:text-white">{m.title}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{m.desc}</div>
                    </button>
                ))}
            </div>

            {/* Inputs */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
                {mode === "suggested" && (
                    <div>
                        {suggestedJDs.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                No suggested JDs yet. Add courses with content so SensAI can suggest them.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {suggestedJDs.map((jd, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedJDIdx(idx)}
                                        className={`text-left rounded-lg border p-3 transition-colors ${selectedJDIdx === idx
                                            ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                                            : "border-gray-200 dark:border-gray-700 hover:border-purple-400"
                                            }`}
                                    >
                                        <div className="font-medium text-sm">{jd.title}</div>
                                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">{jd.description}</div>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {jd.skills.slice(0, 4).map((s, i) => (
                                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {(mode === "own_jd" || mode === "jd_resume") && (
                    <div className="space-y-4">
                        <JDUploader
                            label="Job Description"
                            file={jdFile}
                            setFile={setJdFile}
                            text={jdTextInput}
                            setText={setJdTextInput}
                        />
                        {mode === "jd_resume" && (
                            <JDUploader
                                label="Candidate Resume"
                                file={resumeFile}
                                setFile={setResumeFile}
                                text={resumeTextInput}
                                setText={setResumeTextInput}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Generator controls */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                <LabeledNumber label="Total questions" value={numQuestions} setValue={setNumQuestions} min={3} max={40} />
                <div>
                    <label className="text-xs text-gray-500 uppercase">Difficulty</label>
                    <select
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value as any)}
                        className="mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
                    >
                        <option value="easy">easy</option>
                        <option value="medium">medium</option>
                        <option value="hard">hard</option>
                        <option value="mixed">mixed</option>
                    </select>
                </div>
                <LabeledNumber label="# MCQ" value={mcqCount} setValue={setMcqCount} min={0} max={30} />
                <LabeledNumber label="# Code" value={codeCount} setValue={setCodeCount} min={0} max={15} />
                <LabeledNumber label="# Text" value={textCount} setValue={setTextCount} min={0} max={15} />
            </div>

            <div className="flex gap-3 items-center">
                <button
                    onClick={startByMode}
                    disabled={submitting || (!!genId && !TERMINAL.includes(record?.status || ""))}
                    className="px-5 py-2 text-sm font-medium rounded-full bg-purple-600 text-white disabled:opacity-60 hover:opacity-90 transition"
                >
                    {submitting ? "Starting…" : "Generate"}
                </button>
                {genId && (
                    <button
                        onClick={resetGeneration}
                        className="px-4 py-2 text-sm rounded-full border border-gray-300 dark:border-gray-600"
                    >
                        Reset
                    </button>
                )}
                {errorMsg && <span className="text-sm text-red-500">{errorMsg}</span>}
            </div>

            {/* Status panel */}
            {record && (
                <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        {record.status === "done" ? (
                            <CheckCircle2 size={18} className="text-green-500" />
                        ) : record.status === "failed" ? (
                            <XCircle size={18} className="text-red-500" />
                        ) : (
                            <Loader2 size={18} className="animate-spin text-purple-500" />
                        )}
                        <div className="text-sm font-medium">{statusLabel}</div>
                        {record.jd_type && (
                            <span className="ml-2 text-[10px] uppercase px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                                {record.jd_type} JD
                            </span>
                        )}
                    </div>
                    {record.error && (
                        <p className="text-sm text-red-500">{record.error}</p>
                    )}

                    {/* Awaiting confirmation — unstructured: editable synthesized JD */}
                    {record.status === "awaiting_confirmation" && record.jd_type === "unstructured" && editableJD && (
                        <SynthesizedJDEditor
                            jd={editableJD}
                            onChange={setEditableJD}
                            onConfirm={confirmAndGenerate}
                            submitting={submitting}
                        />
                    )}

                    {/* Awaiting confirmation — structured: just review skills & proceed */}
                    {record.status === "awaiting_confirmation" && record.jd_type === "structured" && (
                        <div className="mt-2 space-y-3">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Your JD was detected as <strong>structured</strong>. We extracted the following skills and weights — review them and click below to generate the questions.
                            </p>
                            {record.weighted_skills && record.weighted_skills.length > 0 && (
                                <div>
                                    <div className="text-xs uppercase text-gray-500 mb-1">Skill weights</div>
                                    <div className="flex flex-wrap gap-1">
                                        {record.weighted_skills.map((w, i) => (
                                            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                                {w.skill} · {(w.weight * 100).toFixed(0)}%
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <button
                                onClick={confirmAndGenerate}
                                disabled={submitting}
                                className="px-5 py-2 text-sm font-medium rounded-full bg-purple-600 text-white disabled:opacity-60 hover:opacity-90"
                            >
                                {submitting ? "Starting…" : "Generate questions"}
                            </button>
                        </div>
                    )}

                    {record.weighted_skills && record.weighted_skills.length > 0 && record.status !== "awaiting_confirmation" && (
                        <div className="mt-2">
                            <div className="text-xs uppercase text-gray-500 mb-1">Skill weights</div>
                            <div className="flex flex-wrap gap-1">
                                {record.weighted_skills.map((w, i) => (
                                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                        {w.skill} · {(w.weight * 100).toFixed(0)}%
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {record.status === "done" && editableQuestions && editableQuestions.length > 0 && (
                        <EditableQuestionList
                            questions={editableQuestions}
                            onChange={saveEditedQuestions}
                        />
                    )}

                    {/* Publish block — shown once generation is done */}
                    {record.status === "done" && editableQuestions && editableQuestions.length > 0 && !publishedTest && (
                        <div className="mt-6 rounded-lg border border-purple-300 dark:border-purple-700 p-4 bg-purple-50 dark:bg-purple-900/10">
                            <div className="flex items-center gap-2 mb-3">
                                <Rocket size={16} className="text-purple-600" />
                                <div className="text-sm font-medium">Publish as a test</div>
                            </div>
                            <input
                                value={publishTitle}
                                onChange={(e) => setPublishTitle(e.target.value)}
                                placeholder="Test title (e.g. Frontend Engineer — Round 1)"
                                className="w-full mb-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                            />
                            <button
                                onClick={publishTest}
                                disabled={publishing}
                                className="px-5 py-2 text-sm font-medium rounded-full bg-purple-600 text-white disabled:opacity-60 hover:opacity-90"
                            >
                                {publishing ? "Publishing…" : "Approve & Publish Test"}
                            </button>
                        </div>
                    )}

                    {/* Published confirmation with test code */}
                    {publishedTest && (
                        <PublishedCard test={publishedTest} onCopy={copyCode} copied={copied} />
                    )}

                    {record.validator_report && (
                        <div className="mt-4 text-xs text-gray-500">
                            Validator: {record.validator_report.ok ? "accepted" : "flagged"}
                            {record.validator_report.issues.length > 0 && (
                                <ul className="list-disc pl-5 mt-1">
                                    {record.validator_report.issues.map((iss, i) => (
                                        <li key={i}>{iss}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function LabeledNumber({
    label, value, setValue, min, max,
}: { label: string; value: number; setValue: (n: number) => void; min: number; max: number }) {
    return (
        <div>
            <label className="text-xs text-gray-500 uppercase">{label}</label>
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                onChange={(e) => setValue(Math.max(min, Math.min(max, parseInt(e.target.value || "0", 10))))}
                className="mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
            />
        </div>
    );
}

function JDUploader({
    label, file, setFile, text, setText,
}: {
    label: string;
    file: File | null;
    setFile: (f: File | null) => void;
    text: string;
    setText: (t: string) => void;
}) {
    return (
        <div>
            <div className="text-sm font-medium mb-2">{label}</div>
            <div className="flex flex-col md:flex-row gap-3">
                <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-gray-300 dark:border-gray-600 cursor-pointer text-sm hover:border-purple-400 w-fit">
                    <Upload size={16} />
                    {file ? file.name : "Upload PDF / DOCX / TXT"}
                    <input
                        type="file"
                        accept=".pdf,.docx,.doc,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                </label>
                {file && (
                    <button
                        type="button"
                        onClick={() => setFile(null)}
                        className="text-xs text-gray-500 underline"
                    >
                        Remove file
                    </button>
                )}
            </div>
            <div className="mt-2">
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <FileText size={12} /> or paste text
                </div>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={5}
                    placeholder={label === "Job Description"
                        ? "e.g. 'I want a React developer and AWS engineer'  — or paste a full JD"
                        : "Paste the resume text here…"}
                    className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent p-2 text-sm"
                />
            </div>
        </div>
    );
}

function SynthesizedJDEditor({
    jd, onChange, onConfirm, submitting,
}: {
    jd: SynthesizedJD;
    onChange: (jd: SynthesizedJD) => void;
    onConfirm: () => void;
    submitting: boolean;
}) {
    return (
        <div className="mt-2 space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
                Your JD was short — we expanded it into the draft below. Review and edit before we generate questions.
            </p>
            <input
                className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent p-2 text-sm font-medium"
                value={jd.title}
                onChange={(e) => onChange({ ...jd, title: e.target.value })}
            />
            <textarea
                className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent p-2 text-sm"
                rows={3}
                value={jd.description}
                onChange={(e) => onChange({ ...jd, description: e.target.value })}
            />
            <div>
                <div className="text-xs text-gray-500 uppercase mb-1">Responsibilities (one per line)</div>
                <textarea
                    className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent p-2 text-sm"
                    rows={4}
                    value={jd.responsibilities.join("\n")}
                    onChange={(e) => onChange({ ...jd, responsibilities: e.target.value.split("\n").filter(Boolean) })}
                />
            </div>
            <div>
                <div className="text-xs text-gray-500 uppercase mb-1">Required skills (comma separated)</div>
                <input
                    className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent p-2 text-sm"
                    value={jd.required_skills.join(", ")}
                    onChange={(e) => onChange({ ...jd, required_skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                />
            </div>
            <button
                onClick={onConfirm}
                disabled={submitting}
                className="px-5 py-2 text-sm font-medium rounded-full bg-purple-600 text-white disabled:opacity-60 hover:opacity-90"
            >
                {submitting ? "Starting…" : "Confirm & Generate questions"}
            </button>
        </div>
    );
}

function EditableQuestionList({
    questions, onChange,
}: { questions: GeneratedQuestion[]; onChange: (q: GeneratedQuestion[]) => void }) {
    const updateAt = (idx: number, next: GeneratedQuestion) => {
        const copy = questions.slice();
        copy[idx] = next;
        onChange(copy);
    };
    const deleteAt = (idx: number) => {
        if (!confirm("Delete this question?")) return;
        onChange(questions.filter((_, i) => i !== idx));
    };
    return (
        <div className="mt-4 space-y-3">
            <div className="text-xs uppercase text-gray-500">Review & edit — {questions.length} questions</div>
            {questions.map((q, i) => (
                <EditableQuestion
                    key={i}
                    index={i}
                    question={q}
                    onChange={(next) => updateAt(i, next)}
                    onDelete={() => deleteAt(i)}
                />
            ))}
        </div>
    );
}

function EditableQuestion({
    index, question, onChange, onDelete,
}: {
    index: number;
    question: GeneratedQuestion;
    onChange: (q: GeneratedQuestion) => void;
    onDelete: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const q = question;

    if (!editing) {
        return (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 uppercase">{q.type}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">{q.skill}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{q.difficulty}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{q.bloom_level}</span>
                    </div>
                    <div className="flex gap-1">
                        <button onClick={() => setEditing(true)} className="p-1 text-gray-500 hover:text-purple-600" title="Edit">
                            <Pencil size={14} />
                        </button>
                        <button onClick={onDelete} className="p-1 text-gray-500 hover:text-red-600" title="Delete">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
                <div className="text-sm mb-2 whitespace-pre-wrap">{q.question}</div>
                {q.type === "mcq" && q.options && (
                    <ul className="space-y-1">
                        {q.options.map((opt, oi) => (
                            <li key={oi} className={`text-sm ${oi === q.correct_index ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}>
                                {String.fromCharCode(65 + oi)}. {opt}
                                {oi === q.correct_index && " ✓"}
                            </li>
                        ))}
                    </ul>
                )}
                {q.type === "code" && (
                    <div className="space-y-2">
                        {q.language && <div className="text-[10px] text-gray-500">Language: {q.language}</div>}
                        {q.starter_code && (
                            <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">{q.starter_code}</pre>
                        )}
                        {q.expected_solution && (
                            <details className="text-xs">
                                <summary className="cursor-pointer text-gray-500">Reference solution</summary>
                                <pre className="mt-1 bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">{q.expected_solution}</pre>
                            </details>
                        )}
                    </div>
                )}
                {q.type === "text" && q.expected_answer && (
                    <details className="text-xs">
                        <summary className="cursor-pointer text-gray-500">Expected answer</summary>
                        <div className="mt-1 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{q.expected_answer}</div>
                    </details>
                )}
            </div>
        );
    }

    // ----- Edit mode -----
    return (
        <div className="rounded-lg border border-purple-400 dark:border-purple-600 p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
                <input
                    value={q.skill}
                    onChange={(e) => onChange({ ...q, skill: e.target.value })}
                    className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 w-40"
                    placeholder="skill"
                />
                <select
                    value={q.difficulty}
                    onChange={(e) => onChange({ ...q, difficulty: e.target.value })}
                    className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1"
                >
                    {["easy", "medium", "hard"].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
            </div>
            <textarea
                value={q.question}
                onChange={(e) => onChange({ ...q, question: e.target.value })}
                rows={3}
                className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-transparent p-2"
            />
            {q.type === "mcq" && q.options && (
                <div className="space-y-1">
                    {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                            <input
                                type="radio"
                                checked={q.correct_index === oi}
                                onChange={() => onChange({ ...q, correct_index: oi })}
                            />
                            <input
                                value={opt}
                                onChange={(e) => {
                                    const newOpts = (q.options || []).slice();
                                    newOpts[oi] = e.target.value;
                                    onChange({ ...q, options: newOpts });
                                }}
                                className="flex-1 text-sm rounded border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1"
                            />
                        </div>
                    ))}
                </div>
            )}
            {q.type === "code" && (
                <div className="space-y-2">
                    <input
                        value={q.language || ""}
                        placeholder="language (python, javascript…)"
                        onChange={(e) => onChange({ ...q, language: e.target.value })}
                        className="w-full text-xs rounded border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1"
                    />
                    <textarea
                        value={q.starter_code || ""}
                        placeholder="starter code (optional)"
                        onChange={(e) => onChange({ ...q, starter_code: e.target.value })}
                        rows={3}
                        className="w-full text-xs font-mono rounded border border-gray-200 dark:border-gray-700 bg-transparent p-2"
                    />
                    <textarea
                        value={q.expected_solution || ""}
                        placeholder="reference solution"
                        onChange={(e) => onChange({ ...q, expected_solution: e.target.value })}
                        rows={3}
                        className="w-full text-xs font-mono rounded border border-gray-200 dark:border-gray-700 bg-transparent p-2"
                    />
                </div>
            )}
            {q.type === "text" && (
                <textarea
                    value={q.expected_answer || ""}
                    placeholder="expected answer / rubric"
                    onChange={(e) => onChange({ ...q, expected_answer: e.target.value })}
                    rows={3}
                    className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-transparent p-2"
                />
            )}
            <div className="flex gap-2">
                <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-1 text-xs rounded-full bg-purple-600 text-white hover:opacity-90"
                >
                    Done
                </button>
                <button
                    onClick={onDelete}
                    className="px-3 py-1 text-xs rounded-full border border-red-400 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

function PublishedCard({
    test, onCopy, copied,
}: {
    test: { id: number; test_code: string; title: string; question_count: number };
    onCopy: () => void;
    copied: boolean;
}) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/recruiter-test/${test.test_code}`;
    return (
        <div className="mt-6 rounded-xl border border-green-500 dark:border-green-700 p-5 bg-green-50 dark:bg-green-900/10">
            <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={18} className="text-green-600" />
                <div className="text-sm font-medium">Test published</div>
            </div>
            <div className="text-lg font-semibold mb-1">{test.title}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                {test.question_count} questions
            </div>

            <div className="text-xs uppercase text-gray-500 mt-3">Test code</div>
            <div className="flex items-center gap-2 mt-1">
                <code className="px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-mono text-lg tracking-widest">
                    {test.test_code}
                </code>
                <button onClick={onCopy} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800" title="Copy">
                    {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                </button>
            </div>

            <div className="text-xs uppercase text-gray-500 mt-4">Share with candidate</div>
            <div className="mt-1 text-xs break-all text-gray-700 dark:text-gray-300">
                {link}
            </div>
            <p className="text-[11px] text-gray-500 mt-3">
                Candidates can attempt this test only with the code above at <strong>/recruiter-test/&lt;code&gt;</strong>.
            </p>
        </div>
    );
}

function QuestionList({ questions }: { questions: GeneratedQuestion[] }) {
    return (
        <div className="mt-4 space-y-3">
            <div className="text-xs uppercase text-gray-500">Generated questions ({questions.length})</div>
            {questions.map((q, i) => (
                <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 uppercase">{q.type}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">{q.skill}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{q.difficulty}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{q.bloom_level}</span>
                    </div>
                    <div className="text-sm mb-2 whitespace-pre-wrap">{q.question}</div>
                    {q.type === "mcq" && q.options && (
                        <ul className="space-y-1">
                            {q.options.map((opt, oi) => (
                                <li key={oi} className={`text-sm ${oi === q.correct_index ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}>
                                    {String.fromCharCode(65 + oi)}. {opt}
                                    {oi === q.correct_index && " ✓"}
                                </li>
                            ))}
                        </ul>
                    )}
                    {q.type === "code" && (
                        <div className="space-y-2">
                            {q.language && <div className="text-[10px] text-gray-500">Language: {q.language}</div>}
                            {q.starter_code && (
                                <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">{q.starter_code}</pre>
                            )}
                            {q.expected_solution && (
                                <details className="text-xs">
                                    <summary className="cursor-pointer text-gray-500">Reference solution</summary>
                                    <pre className="mt-1 bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">{q.expected_solution}</pre>
                                </details>
                            )}
                        </div>
                    )}
                    {q.type === "text" && q.expected_answer && (
                        <details className="text-xs">
                            <summary className="cursor-pointer text-gray-500">Expected answer</summary>
                            <div className="mt-1 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{q.expected_answer}</div>
                        </details>
                    )}
                </div>
            ))}
        </div>
    );
}
