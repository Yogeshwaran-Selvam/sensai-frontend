"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Sparkles, Plus, Brain } from "lucide-react";
import {
    QuizPurpose,
    QuizDifficulty,
    QuestionType,
    AnswerType,
    ObjectiveAnswerType,
    SubjectiveAnswerType,
    TopicWeight,
    QuizGenerationPayload,
    QUIZ_LENGTHS,
    QuizLength,
    DEFAULT_MAJOR_TOPICS,
    ADDABLE_MINOR_TOPICS,
    BloomsDistribution,
    DEFAULT_BLOOMS_DISTRIBUTION,
    BLOOMS_LEVELS,
} from "@/types/quizGeneration";

// DEFAULT_MAJOR_TOPICS and ADDABLE_MINOR_TOPICS are used as fallbacks when no DB keywords exist

// ─── Reusable sub-components ────────────────────────────────────────

function ToggleGroup({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">{label}</p>
            <div className="flex rounded-lg bg-zinc-800 p-0.5">
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                            value === opt.value
                                ? "bg-purple-600 text-white shadow-sm"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ChipGroup<T extends string | number>({
    label,
    options,
    value,
    onChange,
    renderLabel,
}: {
    label: string;
    options: readonly T[];
    value: T;
    onChange: (v: T) => void;
    renderLabel?: (v: T) => string;
}) {
    return (
        <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">{label}</p>
            <div className="flex flex-wrap gap-2">
                {options.map((opt) => (
                    <button
                        key={String(opt)}
                        onClick={() => onChange(opt)}
                        className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                            value === opt
                                ? "bg-purple-600 text-white shadow-md shadow-purple-600/25"
                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                        }`}
                    >
                        {renderLabel ? renderLabel(opt) : String(opt)}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Topic slider row ─────────────────────────────────────────────────

function TopicRow({ topic, onChange, onDelete }: { topic: TopicWeight; onChange: (w: number) => void; onDelete: () => void }) {
    return (
        <div className="group flex items-center gap-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-zinc-300 truncate">{topic.keyword}</span>
                    <span className="text-xs font-mono text-zinc-400 ml-2 shrink-0 w-10 text-right">{topic.weight}%</span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={topic.weight}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-purple-500"
                />
            </div>
            <button
                onClick={onDelete}
                className="p-1 rounded-md text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

function calibrate(topics: TopicWeight[], changedIndex: number, newWeight: number): TopicWeight[] {
    const clamped = Math.max(0, Math.min(100, newWeight));
    const others = topics.filter((_, i) => i !== changedIndex);
    const totalOthers = others.reduce((s, t) => s + t.weight, 0);
    const remaining = 100 - clamped;
    const updated = topics.map((t, i) => {
        if (i === changedIndex) return { ...t, weight: clamped };
        if (totalOthers === 0) return { ...t, weight: Math.floor(remaining / others.length) };
        return { ...t, weight: Math.round((t.weight / totalOthers) * remaining) };
    });
    const total = updated.reduce((s, t) => s + t.weight, 0);
    const diff = 100 - total;
    if (diff !== 0) {
        for (let i = updated.length - 1; i >= 0; i--) {
            if (i !== changedIndex) {
                const corrected = updated[i].weight + diff;
                if (corrected >= 0 && corrected <= 100) {
                    updated[i] = { ...updated[i], weight: corrected };
                    break;
                }
            }
        }
    }
    return updated;
}

function calibrateBlooms(dist: BloomsDistribution, key: keyof BloomsDistribution, newValue: number): BloomsDistribution {
    const keys = Object.keys(dist) as (keyof BloomsDistribution)[];
    const clamped = Math.max(0, Math.min(100, newValue));
    const others = keys.filter((k) => k !== key);
    const totalOthers = others.reduce((s, k) => s + dist[k], 0);
    const remaining = 100 - clamped;
    const updated: BloomsDistribution = { ...dist, [key]: clamped };
    others.forEach((k) => {
        updated[k] = totalOthers === 0
            ? Math.floor(remaining / others.length)
            : Math.round((dist[k] / totalOthers) * remaining);
    });
    const total = keys.reduce((s, k) => s + updated[k], 0);
    const diff = 100 - total;
    if (diff !== 0) {
        for (let i = others.length - 1; i >= 0; i--) {
            const k = others[i];
            const corrected = updated[k] + diff;
            if (corrected >= 0 && corrected <= 100) {
                updated[k] = corrected;
                break;
            }
        }
    }
    return updated;
}

// ─── Main component ───────────────────────────────────────────────────

export interface QuizGenerationWizardProps {
    open: boolean;
    onClose: () => void;
    onGenerate?: (payload: QuizGenerationPayload) => void;
    onAddQuestions?: (questions: any[]) => void;
    courseId: number;
    orgId: number;
    milestoneId?: string;
    courseTitle?: string;
    moduleTitle?: string;
}

export default function QuizGenerationWizard({
    open,
    onClose,
    onGenerate,
    onAddQuestions,
    courseId,
    orgId,
    milestoneId,
    courseTitle = "",
    moduleTitle = "",
}: QuizGenerationWizardProps) {
    const [purpose, setPurpose] = useState<QuizPurpose>("practice");
    const [length, setLength] = useState<QuizLength>(10);
    const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
    const [questionType, setQuestionType] = useState<QuestionType>("objective");
    const [answerType, setAnswerType] = useState<AnswerType>("mcq");
    const [topics, setTopics] = useState<TopicWeight[]>([]);
    const [bloomsEnabled, setBloomsEnabled] = useState(false);
    const [bloomsDist, setBloomsDist] = useState<BloomsDistribution>(DEFAULT_BLOOMS_DISTRIBUTION);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [generatingStep, setGeneratingStep] = useState("");

    const [isAddingCustom, setIsAddingCustom] = useState(false);
    const [customName, setCustomName] = useState("");
    const [dynamicMinors, setDynamicMinors] = useState<string[]>([...ADDABLE_MINOR_TOPICS]);
    const customInputRef = useRef<HTMLInputElement>(null);

    const initTopics = (keywords: string[]) => {
        // Top 3 become major topics, everything else is ignored (shown as addable chips if ≤5 total)
        const majors = keywords.slice(0, 3);
        const n = majors.length || 1;
        const base = Math.floor(100 / n);
        const rem = 100 - base * n;
        return majors.map((kw, i) => ({
            keyword: kw,
            weight: base + (i === 0 ? rem : 0),
            tier: "major" as const,
        }));
    };

    useEffect(() => {
        if (!open) return;
        setPurpose("practice");
        setLength(10);
        setDifficulty("medium");
        setQuestionType("objective");
        setAnswerType("mcq");
        setError("");
        setIsLoading(false);
        setBloomsEnabled(false);
        setBloomsDist(DEFAULT_BLOOMS_DISTRIBUTION);
        setIsAddingCustom(false);
        setCustomName("");

        // Load keywords from DB for this milestone; fall back to defaults
        const loadKeywords = async () => {
            if (courseId && milestoneId) {
                try {
                    const res = await fetch(
                        `${process.env.NEXT_PUBLIC_BACKEND_URL}/courses/${courseId}/milestones/${milestoneId}/keywords`
                    );
                    if (res.ok) {
                        const data = await res.json();
                        const kws: string[] = data.keywords || [];
                        if (kws.length > 0) {
                            setTopics(initTopics(kws));
                            // Remaining keywords (4th, 5th) become addable minor chips
                            setDynamicMinors(kws.slice(3, 5));
                            return;
                        }
                    }
                } catch {
                    // fall through to defaults
                }
            }
            // Defaults
            setDynamicMinors([...ADDABLE_MINOR_TOPICS]);
            const n = DEFAULT_MAJOR_TOPICS.length;
            const base = Math.floor(100 / n);
            const rem = 100 - base * n;
            setTopics(
                DEFAULT_MAJOR_TOPICS.map((kw, i) => ({
                    keyword: kw,
                    weight: base + (i === 0 ? rem : 0),
                    tier: "major" as const,
                }))
            );
        };
        loadKeywords();
    }, [open, courseId, milestoneId]);

    useEffect(() => {
        setAnswerType(questionType === "objective" ? "mcq" : "short_answer");
    }, [questionType]);

    useEffect(() => {
        if (isAddingCustom) customInputRef.current?.focus();
    }, [isAddingCustom]);

    const addedMinors = topics.filter((t) => t.tier === "minor").map((t) => t.keyword);
    const availableMinors = dynamicMinors.filter((m) => !addedMinors.includes(m) && !topics.some((t) => t.keyword === m));

    const handleSliderChange = (index: number, newWeight: number) => {
        setTopics((prev) => calibrate(prev, index, newWeight));
    };

    const handleDelete = (index: number) => {
        setTopics((prev) => {
            const next = prev.filter((_, i) => i !== index);
            if (next.length === 0) return next;
            const base = Math.floor(100 / next.length);
            const rem = 100 - base * next.length;
            return next.map((t, i) => ({ ...t, weight: base + (i === 0 ? rem : 0) }));
        });
    };

    const addMinorTopic = (name: string) => {
        setTopics((prev) => {
            const withNew: TopicWeight[] = [...prev, { keyword: name, weight: 0, tier: "minor" }];
            return calibrate(withNew, withNew.length - 1, 10);
        });
    };

    const addCustomTopic = () => {
        const name = customName.trim();
        if (!name) return;
        if (topics.some((t) => t.keyword.toLowerCase() === name.toLowerCase())) {
            setError("Topic already exists");
            return;
        }
        setError("");
        setTopics((prev) => {
            const withNew: TopicWeight[] = [...prev, { keyword: name, weight: 0, tier: "custom" }];
            return calibrate(withNew, withNew.length - 1, 10);
        });
        setCustomName("");
        setIsAddingCustom(false);
    };

    const handleBloomsChange = (key: keyof BloomsDistribution, newValue: number) => {
        setBloomsDist((prev) => calibrateBlooms(prev, key, newValue));
    };

    const bloomsTotal = Object.values(bloomsDist).reduce((s, v) => s + v, 0);
    const totalWeight = topics.reduce((s, t) => s + t.weight, 0);

    const handleGenerate = async () => {
        if (topics.length === 0) { setError("Add at least one topic"); return; }
        if (bloomsEnabled && bloomsTotal !== 100) { setError("Bloom's distribution must sum to 100%"); return; }

        setError("");
        setIsLoading(true);
        setGeneratingStep("Generating questions with AI...");

        try {
            const payload = {
                course_title: courseTitle,
                module_title: moduleTitle,
                purpose,
                length,
                difficulty,
                question_type: questionType,
                answer_type: answerType,
                topic_weights: topics.map((t) => ({ keyword: t.keyword, weight: t.weight })),
                bloom_distribution: bloomsEnabled ? bloomsDist : null,
                course_id: courseId,
                org_id: orgId,
            };

            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/quiz-generation/generate-questions`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
            );

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || `Request failed (${res.status})`);
            }

            setGeneratingStep("Verifying & adding to quiz...");
            const data = await res.json();

            // Attach regen metadata so QuizEditor can refresh "wrong" questions
            const regenMeta = { difficulty, question_type: questionType, answer_type: answerType, course_title: courseTitle, module_title: moduleTitle };
            const questionsWithMeta = (data.questions || []).map((q: any) => ({ ...q, _regen_meta: regenMeta }));

            onAddQuestions?.(questionsWithMeta);
            onGenerate?.(payload as any);
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to generate questions");
        } finally {
            setIsLoading(false);
            setGeneratingStep("");
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/40 z-[65] transition-opacity duration-300 ${
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                }`}
                onClick={isLoading ? undefined : onClose}
            />

            {/* Drawer */}
            <div
                className={`fixed top-0 right-0 h-full w-full max-w-md z-[70] transform transition-transform duration-300 ease-out ${
                    open ? "translate-x-0" : "translate-x-full"
                }`}
            >
                <div className="h-full flex flex-col bg-zinc-900 border-l border-zinc-800 shadow-2xl">

                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                            <div className="min-w-0">
                                <h2 className="text-sm font-semibold text-white leading-tight">Generate Quiz</h2>
                                {(courseTitle || moduleTitle) && (
                                    <p className="text-xs text-zinc-500 truncate mt-0.5">
                                        {[courseTitle, moduleTitle].filter(Boolean).join(" · ")}
                                    </p>
                                )}
                            </div>
                        </div>
                        {!isLoading && (
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Generating overlay */}
                    {isLoading && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
                            <div className="w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center">
                                <Sparkles className="w-7 h-7 text-purple-400 animate-pulse" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="text-white font-medium">AI is working...</p>
                                <p className="text-sm text-zinc-400">{generatingStep}</p>
                            </div>
                            <div className="flex gap-1">
                                {[0, 1, 2].map((i) => (
                                    <div key={i} className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                                ))}
                            </div>
                            <p className="text-xs text-zinc-500 text-center max-w-xs">
                                Generating {length} questions then verifying — may take up to 30 seconds.
                            </p>
                        </div>
                    )}

                    {/* Config body */}
                    {!isLoading && (
                        <>
                            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

                                <ToggleGroup
                                    label="Purpose"
                                    value={purpose}
                                    onChange={(v) => setPurpose(v as QuizPurpose)}
                                    options={[
                                        { value: "practice", label: "Practice" },
                                        { value: "exam", label: "Exam" },
                                    ]}
                                />

                                <ChipGroup
                                    label="Length (questions)"
                                    options={QUIZ_LENGTHS}
                                    value={length}
                                    onChange={setLength}
                                />

                                <ChipGroup
                                    label="Difficulty"
                                    options={["easy", "medium", "hard"] as const}
                                    value={difficulty}
                                    onChange={(v) => setDifficulty(v as QuizDifficulty)}
                                    renderLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                                />

                                <ToggleGroup
                                    label="Question Type"
                                    value={questionType}
                                    onChange={(v) => setQuestionType(v as QuestionType)}
                                    options={[
                                        { value: "objective", label: "Objective" },
                                        { value: "subjective", label: "Subjective" },
                                    ]}
                                />

                                {questionType === "objective" ? (
                                    <ChipGroup<ObjectiveAnswerType>
                                        label="Answer Type"
                                        options={["mcq", "fill_in_the_blanks"]}
                                        value={answerType as ObjectiveAnswerType}
                                        onChange={(v) => setAnswerType(v)}
                                        renderLabel={(v) => v === "mcq" ? "MCQs" : "Fill in the blanks"}
                                    />
                                ) : (
                                    <ChipGroup<SubjectiveAnswerType>
                                        label="Answer Type"
                                        options={["short_answer", "long_answer", "code"]}
                                        value={answerType as SubjectiveAnswerType}
                                        onChange={(v) => setAnswerType(v)}
                                        renderLabel={(v) => ({ short_answer: "Short Answer", long_answer: "Long Answer", code: "Code" }[v])}
                                    />
                                )}

                                <div className="border-t border-zinc-800" />

                                {/* Topics */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Topics & Weightage</p>
                                        <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${totalWeight === 100 ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                                            {totalWeight}%
                                        </span>
                                    </div>
                                    <div className="space-y-4">
                                        {topics.map((topic, i) => (
                                            <TopicRow
                                                key={`${topic.keyword}-${i}`}
                                                topic={topic}
                                                onChange={(w) => handleSliderChange(i, w)}
                                                onDelete={() => handleDelete(i)}
                                            />
                                        ))}
                                    </div>
                                    {availableMinors.length > 0 && (
                                        <div className="mt-4">
                                            <p className="text-xs text-zinc-500 mb-2">Add minor topic</p>
                                            <div className="flex flex-wrap gap-2">
                                                {availableMinors.map((name) => (
                                                    <button key={name} onClick={() => addMinorTopic(name)}
                                                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700 transition-colors">
                                                        <Plus className="w-3 h-3" />{name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="mt-3">
                                        {!isAddingCustom ? (
                                            <button onClick={() => setIsAddingCustom(true)}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-dashed border-zinc-700 hover:border-zinc-500 transition-colors">
                                                <Plus className="w-3 h-3" />Other topic
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <input ref={customInputRef} type="text" value={customName}
                                                    onChange={(e) => setCustomName(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") addCustomTopic(); if (e.key === "Escape") { setIsAddingCustom(false); setCustomName(""); } }}
                                                    placeholder="Type topic name..."
                                                    className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                                />
                                                <button onClick={addCustomTopic} disabled={!customName.trim()}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40">Add</button>
                                                <button onClick={() => { setIsAddingCustom(false); setCustomName(""); }}
                                                    className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="border-t border-zinc-800" />

                                {/* Bloom's Taxonomy Toggle */}
                                <div>
                                    <button
                                        onClick={() => setBloomsEnabled((v) => !v)}
                                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Brain className="w-4 h-4 text-violet-400" />
                                            <span className="text-sm font-medium text-zinc-200">Bloom&apos;s Taxonomy</span>
                                            <span className="text-xs text-zinc-500">cognitive distribution</span>
                                        </div>
                                        <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${bloomsEnabled ? 'bg-violet-600' : 'bg-zinc-600'}`}>
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${bloomsEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </div>
                                    </button>

                                    {bloomsEnabled && (
                                        <div className="mt-3 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs text-zinc-500">Adjust level distribution</p>
                                                <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${bloomsTotal === 100 ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                                                    {bloomsTotal}%
                                                </span>
                                            </div>
                                            {BLOOMS_LEVELS.map(({ key, label, color }) => (
                                                <div key={key} className="flex items-center gap-3">
                                                    <div className="w-24 shrink-0 flex items-center gap-1.5">
                                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                        <span className="text-xs text-zinc-300">{label}</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <input
                                                            type="range" min={0} max={100} step={5}
                                                            value={bloomsDist[key]}
                                                            onChange={(e) => handleBloomsChange(key, parseInt(e.target.value))}
                                                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700"
                                                            style={{ accentColor: color }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-mono text-zinc-400 w-8 text-right shrink-0">{bloomsDist[key]}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {error && (
                                    <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
                                <button
                                    onClick={handleGenerate}
                                    disabled={topics.length === 0}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-600/20"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Generate
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
