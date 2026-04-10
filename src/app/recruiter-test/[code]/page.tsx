"use client";

/**
 * Candidate-facing test page. A candidate must possess a valid test code
 * (the URL is /recruiter-test/<code>). They enter their name/email, take the
 * test, and submit. MCQs are auto-scored server-side; code and text answers
 * are saved for manual review.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

interface CandidateQuestion {
    type: "mcq" | "code" | "text";
    skill: string;
    difficulty: string;
    bloom_level: string;
    question: string;
    options?: string[];
    language?: string;
    starter_code?: string;
}

interface TestInfo {
    id: number;
    title: string;
    test_code: string;
    questions: CandidateQuestion[];
}

type Phase = "loading" | "invalid" | "lobby" | "in_progress" | "submitting" | "done" | "error";

export default function CandidateTestPage() {
    const params = useParams<{ code: string }>();
    const code = (params?.code || "").toUpperCase();
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL;

    const [phase, setPhase] = useState<Phase>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [testMeta, setTestMeta] = useState<{ title: string; question_count: number } | null>(null);
    const [candidateName, setCandidateName] = useState("");
    const [candidateEmail, setCandidateEmail] = useState("");

    const [attemptId, setAttemptId] = useState<number | null>(null);
    const [test, setTest] = useState<TestInfo | null>(null);
    const [answers, setAnswers] = useState<Record<number, { mcq?: number; text?: string; code?: string }>>({});

    const [result, setResult] = useState<{ score: number | null; max_score: number | null; note?: string } | null>(null);

    // Fetch test metadata by code
    useEffect(() => {
        if (!code) return;
        (async () => {
            try {
                const res = await fetch(`${backend}/recruiter/tests/code/${code}`);
                if (res.status === 404) {
                    setPhase("invalid");
                    return;
                }
                if (!res.ok) throw new Error(`Failed to load test (${res.status})`);
                const data = await res.json();
                setTestMeta({ title: data.title, question_count: data.question_count });
                setPhase("lobby");
            } catch (e: any) {
                setErrorMsg(e?.message || "Failed to load");
                setPhase("error");
            }
        })();
    }, [backend, code]);

    const startTest = useCallback(async () => {
        if (!candidateName.trim() || !candidateEmail.trim()) {
            setErrorMsg("Please enter your name and email");
            return;
        }
        setErrorMsg(null);
        try {
            const res = await fetch(`${backend}/recruiter/tests/code/${code}/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    candidate_name: candidateName,
                    candidate_email: candidateEmail,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.detail || `Failed to start (${res.status})`);
            }
            const data = await res.json();
            setAttemptId(data.attempt_id);
            setTest(data.test);
            setPhase("in_progress");
        } catch (e: any) {
            setErrorMsg(e?.message || "Failed to start");
        }
    }, [backend, code, candidateName, candidateEmail]);

    const setMCQ = (idx: number, opt: number) => {
        setAnswers((a) => ({ ...a, [idx]: { ...a[idx], mcq: opt } }));
    };
    const setText = (idx: number, value: string) => {
        setAnswers((a) => ({ ...a, [idx]: { ...a[idx], text: value } }));
    };
    const setCode = (idx: number, value: string) => {
        setAnswers((a) => ({ ...a, [idx]: { ...a[idx], code: value } }));
    };

    const submit = async () => {
        if (!attemptId || !test) return;
        if (!confirm("Submit your answers? You won't be able to edit them after.")) return;
        setPhase("submitting");
        setErrorMsg(null);
        try {
            const payload = {
                answers: test.questions.map((q, i) => ({
                    question_index: i,
                    mcq_selected_index: answers[i]?.mcq ?? null,
                    text_answer: answers[i]?.text ?? null,
                    code_answer: answers[i]?.code ?? null,
                })),
            };
            const res = await fetch(`${backend}/recruiter/tests/attempts/${attemptId}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.detail || `Submit failed (${res.status})`);
            }
            const data = await res.json();
            setResult({ score: data.score, max_score: data.max_score, note: data.note });
            setPhase("done");
        } catch (e: any) {
            setErrorMsg(e?.message || "Failed to submit");
            setPhase("in_progress");
        }
    };

    if (phase === "loading") {
        return (
            <Centered>
                <Loader2 size={24} className="animate-spin text-purple-500" />
                <span className="ml-2">Loading test…</span>
            </Centered>
        );
    }

    if (phase === "invalid") {
        return (
            <Centered>
                <XCircle size={32} className="text-red-500" />
                <div className="mt-2 text-lg">Invalid or expired test code: <code>{code}</code></div>
                <p className="text-sm text-gray-500 mt-1">Please check the code you received from the recruiter.</p>
            </Centered>
        );
    }

    if (phase === "error") {
        return (
            <Centered>
                <XCircle size={32} className="text-red-500" />
                <div className="mt-2 text-lg">{errorMsg}</div>
            </Centered>
        );
    }

    if (phase === "lobby") {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-black">
                <div className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 p-6 bg-white dark:bg-gray-900">
                    <div className="text-xs uppercase text-gray-500 mb-1">Test code</div>
                    <div className="font-mono text-lg tracking-widest mb-3">{code}</div>
                    <h1 className="text-xl font-light mb-1">{testMeta?.title}</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                        {testMeta?.question_count} questions. Enter your details to begin.
                    </p>
                    <label className="text-xs uppercase text-gray-500">Full name</label>
                    <input
                        className="mt-1 mb-3 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                        value={candidateName}
                        onChange={(e) => setCandidateName(e.target.value)}
                    />
                    <label className="text-xs uppercase text-gray-500">Email</label>
                    <input
                        type="email"
                        className="mt-1 mb-4 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                        value={candidateEmail}
                        onChange={(e) => setCandidateEmail(e.target.value)}
                    />
                    {errorMsg && <div className="text-sm text-red-500 mb-3">{errorMsg}</div>}
                    <button
                        onClick={startTest}
                        className="w-full px-4 py-2 rounded-full bg-purple-600 text-white text-sm font-medium hover:opacity-90"
                    >
                        Start Test
                    </button>
                </div>
            </div>
        );
    }

    if ((phase === "in_progress" || phase === "submitting") && test) {
        return (
            <div className="min-h-screen p-6 bg-gray-50 dark:bg-black">
                <div className="max-w-3xl mx-auto">
                    <div className="mb-4">
                        <div className="text-xs uppercase text-gray-500">Assessment</div>
                        <h1 className="text-2xl font-light">{test.title}</h1>
                        <div className="text-xs text-gray-500 mt-1">{candidateName} · {candidateEmail}</div>
                    </div>

                    <div className="space-y-4">
                        {test.questions.map((q, i) => (
                            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="text-[11px] text-gray-500">Q{i + 1}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 uppercase">{q.type}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">{q.skill}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{q.difficulty}</span>
                                </div>
                                <div className="text-sm mb-3 whitespace-pre-wrap">{q.question}</div>

                                {q.type === "mcq" && q.options && (
                                    <div className="space-y-2">
                                        {q.options.map((opt, oi) => (
                                            <label key={oi} className="flex items-start gap-2 cursor-pointer text-sm">
                                                <input
                                                    type="radio"
                                                    name={`q-${i}`}
                                                    className="mt-1"
                                                    checked={answers[i]?.mcq === oi}
                                                    onChange={() => setMCQ(i, oi)}
                                                />
                                                <span>{String.fromCharCode(65 + oi)}. {opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}

                                {q.type === "code" && (
                                    <div className="space-y-2">
                                        {q.language && <div className="text-[11px] text-gray-500">Language: {q.language}</div>}
                                        {q.starter_code && (
                                            <pre className="text-xs bg-gray-50 dark:bg-black p-2 rounded overflow-x-auto border border-gray-100 dark:border-gray-800">
                                                {q.starter_code}
                                            </pre>
                                        )}
                                        <textarea
                                            value={answers[i]?.code || ""}
                                            onChange={(e) => setCode(i, e.target.value)}
                                            rows={8}
                                            placeholder="Write your solution here…"
                                            className="w-full font-mono text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-transparent p-2"
                                        />
                                    </div>
                                )}

                                {q.type === "text" && (
                                    <textarea
                                        value={answers[i]?.text || ""}
                                        onChange={(e) => setText(i, e.target.value)}
                                        rows={4}
                                        placeholder="Your answer…"
                                        className="w-full text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-transparent p-2"
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    {errorMsg && <div className="mt-4 text-sm text-red-500">{errorMsg}</div>}

                    <div className="mt-6 flex justify-end">
                        <button
                            onClick={submit}
                            disabled={phase === "submitting"}
                            className="px-6 py-2 rounded-full bg-purple-600 text-white text-sm font-medium disabled:opacity-60 hover:opacity-90"
                        >
                            {phase === "submitting" ? "Submitting…" : "Submit Test"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === "done" && result) {
        const pct = result.max_score && result.max_score > 0
            ? Math.round(((result.score || 0) / result.max_score) * 100)
            : null;
        return (
            <Centered>
                <CheckCircle2 size={40} className="text-green-500" />
                <div className="mt-3 text-2xl font-light">Submission received</div>
                {result.max_score && result.max_score > 0 && (
                    <div className="mt-3 text-lg">
                        MCQ score: <strong>{result.score}</strong> / {result.max_score}
                        {pct !== null && <span className="text-gray-500"> ({pct}%)</span>}
                    </div>
                )}
                {result.note && (
                    <p className="mt-2 text-xs text-gray-500 max-w-md text-center">{result.note}</p>
                )}
            </Centered>
        );
    }

    return null;
}

function Centered({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gray-50 dark:bg-black">
            {children}
        </div>
    );
}
