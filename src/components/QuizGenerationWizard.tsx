"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Sparkles, Plus } from "lucide-react";
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
} from "@/types/quizGeneration";

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

// ─── Smart slider (auto-calibrates others to keep total = 100) ──────

interface TopicRowProps {
    topic: TopicWeight;
    onChange: (weight: number) => void;
    onDelete: () => void;
}

function TopicRow({ topic, onChange, onDelete }: TopicRowProps) {
    return (
        <div className="group flex items-center gap-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-zinc-300 truncate">{topic.keyword}</span>
                    <span className="text-xs font-mono text-zinc-400 ml-2 shrink-0 w-10 text-right">
                        {topic.weight}%
                    </span>
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
                title="Remove topic"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// ─── Calibration logic ───────────────────────────────────────────────
// When slider i changes to newWeight, redistribute the remainder (100 - newWeight)
// proportionally across all other sliders. Always sums to exactly 100.
function calibrate(topics: TopicWeight[], changedIndex: number, newWeight: number): TopicWeight[] {
    const clamped = Math.max(0, Math.min(100, newWeight));
    const others = topics.filter((_, i) => i !== changedIndex);
    const totalOthers = others.reduce((s, t) => s + t.weight, 0);
    const remaining = 100 - clamped;

    const updated = topics.map((t, i) => {
        if (i === changedIndex) return { ...t, weight: clamped };
        if (totalOthers === 0) {
            // distribute evenly
            return { ...t, weight: Math.floor(remaining / others.length) };
        }
        return { ...t, weight: Math.round((t.weight / totalOthers) * remaining) };
    });

    // Fix rounding error: adjust the last non-changed slider so total == 100
    const total = updated.reduce((s, t) => s + t.weight, 0);
    const diff = 100 - total;
    if (diff !== 0) {
        // find last other-than-changed slider that can absorb the diff
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

// ─── Main component ──────────────────────────────────────────────────

export interface QuizGenerationWizardProps {
    open: boolean;
    onClose: () => void;
    onGenerate?: (payload: QuizGenerationPayload) => void;
    courseId: number;
    orgId: number;
    courseTitle?: string;
    moduleTitle?: string;
}

export default function QuizGenerationWizard({
    open,
    onClose,
    onGenerate,
    courseId,
    orgId,
    courseTitle = "",
    moduleTitle = "",
}: QuizGenerationWizardProps) {
    // ── State ────────────────────────────────────────────────────────
    const [purpose, setPurpose] = useState<QuizPurpose>("practice");
    const [length, setLength] = useState<QuizLength>(10);
    const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
    const [questionType, setQuestionType] = useState<QuestionType>("objective");
    const [answerType, setAnswerType] = useState<AnswerType>("mcq");
    const [topics, setTopics] = useState<TopicWeight[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    // custom "other topic" input
    const [isAddingCustom, setIsAddingCustom] = useState(false);
    const [customName, setCustomName] = useState("");
    const customInputRef = useRef<HTMLInputElement>(null);

    // ── Initialise / reset on open ───────────────────────────────────
    useEffect(() => {
        if (!open) return;
        setPurpose("practice");
        setLength(10);
        setDifficulty("medium");
        setQuestionType("objective");
        setAnswerType("mcq");
        setError("");
        setIsLoading(false);
        setIsAddingCustom(false);
        setCustomName("");

        // Start with 3 major topics, equal weights
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
    }, [open]);

    // sync answer type when question type changes
    useEffect(() => {
        setAnswerType(questionType === "objective" ? "mcq" : "short_answer");
    }, [questionType]);

    useEffect(() => {
        if (isAddingCustom) customInputRef.current?.focus();
    }, [isAddingCustom]);

    // ── Topic helpers ────────────────────────────────────────────────
    const addedMinors = topics
        .filter((t) => t.tier === "minor")
        .map((t) => t.keyword);

    const availableMinors = ADDABLE_MINOR_TOPICS.filter(
        (m) => !addedMinors.includes(m)
    );

    const handleSliderChange = (index: number, newWeight: number) => {
        setTopics((prev) => calibrate(prev, index, newWeight));
    };

    const handleDelete = (index: number) => {
        setTopics((prev) => {
            const next = prev.filter((_, i) => i !== index);
            if (next.length === 0) return next;
            // Re-calibrate: distribute 100 evenly after removal
            const base = Math.floor(100 / next.length);
            const rem = 100 - base * next.length;
            return next.map((t, i) => ({ ...t, weight: base + (i === 0 ? rem : 0) }));
        });
    };

    const addMinorTopic = (name: string) => {
        setTopics((prev) => {
            // new topic starts at 0, recalibrate relative to index = prev.length (new last)
            const withNew: TopicWeight[] = [...prev, { keyword: name, weight: 0, tier: "minor" }];
            // give the new topic 10% and scale others down
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

    // ── Generate ─────────────────────────────────────────────────────
    const handleGenerate = async () => {
        const total = topics.reduce((s, t) => s + t.weight, 0);
        if (topics.length === 0) {
            setError("Add at least one topic");
            return;
        }

        const payload: QuizGenerationPayload = {
            course_title: courseTitle,
            module_title: moduleTitle,
            purpose,
            length,
            difficulty,
            question_type: questionType,
            answer_type: answerType,
            topic_weights: topics.map((t) => ({ keyword: t.keyword, weight: t.weight })),
            course_id: courseId,
            org_id: orgId,
        };

        console.log("📤 Quiz Generation Payload:", JSON.stringify(payload, null, 2));

        try {
            setIsLoading(true);
            setError("");

            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/quiz-generation/`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || `Request failed (${res.status})`);
            }

            const data = await res.json();
            console.log("✅ Quiz Generation Response:", data);

            onGenerate?.(payload);
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to generate quiz");
        } finally {
            setIsLoading(false);
        }
    };

    // ── Render ───────────────────────────────────────────────────────
    const totalWeight = topics.reduce((s, t) => s + t.weight, 0);

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/40 z-[65] transition-opacity duration-300 ${
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                }`}
                onClick={onClose}
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
                                <h2 className="text-sm font-semibold text-white leading-tight">
                                    Generate Quiz
                                </h2>
                                {(courseTitle || moduleTitle) && (
                                    <p className="text-xs text-zinc-500 truncate mt-0.5">
                                        {[courseTitle, moduleTitle].filter(Boolean).join(" · ")}
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

                        {/* Purpose */}
                        <ToggleGroup
                            label="Purpose"
                            value={purpose}
                            onChange={(v) => setPurpose(v as QuizPurpose)}
                            options={[
                                { value: "practice", label: "Practice" },
                                { value: "exam", label: "Exam" },
                            ]}
                        />

                        {/* Length */}
                        <ChipGroup
                            label="Length (questions)"
                            options={QUIZ_LENGTHS}
                            value={length}
                            onChange={setLength}
                        />

                        {/* Difficulty */}
                        <ChipGroup
                            label="Difficulty"
                            options={["easy", "medium", "hard"] as const}
                            value={difficulty}
                            onChange={(v) => setDifficulty(v as QuizDifficulty)}
                            renderLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                        />

                        {/* Question Type */}
                        <ToggleGroup
                            label="Question Type"
                            value={questionType}
                            onChange={(v) => setQuestionType(v as QuestionType)}
                            options={[
                                { value: "objective", label: "Objective" },
                                { value: "subjective", label: "Subjective" },
                            ]}
                        />

                        {/* Answer Type — conditional */}
                        {questionType === "objective" ? (
                            <ChipGroup<ObjectiveAnswerType>
                                label="Answer Type"
                                options={["mcq", "fill_in_the_blanks"]}
                                value={answerType as ObjectiveAnswerType}
                                onChange={(v) => setAnswerType(v)}
                                renderLabel={(v) =>
                                    v === "mcq" ? "MCQs" : "Fill in the blanks"
                                }
                            />
                        ) : (
                            <ChipGroup<SubjectiveAnswerType>
                                label="Answer Type"
                                options={["short_answer", "long_answer", "code"]}
                                value={answerType as SubjectiveAnswerType}
                                onChange={(v) => setAnswerType(v)}
                                renderLabel={(v) =>
                                    ({ short_answer: "Short Answer", long_answer: "Long Answer", code: "Code" }[v])
                                }
                            />
                        )}

                        {/* Divider */}
                        <div className="border-t border-zinc-800" />

                        {/* Topics & Weightage */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                                    Topics & Weightage
                                </p>
                                <span
                                    className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                                        totalWeight === 100
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : "bg-amber-500/20 text-amber-400"
                                    }`}
                                >
                                    {totalWeight}%
                                </span>
                            </div>

                            {/* Topic sliders */}
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

                            {/* Addable minor topics */}
                            {availableMinors.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-xs text-zinc-500 mb-2">Add minor topic</p>
                                    <div className="flex flex-wrap gap-2">
                                        {availableMinors.map((name) => (
                                            <button
                                                key={name}
                                                onClick={() => addMinorTopic(name)}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 transition-colors"
                                            >
                                                <Plus className="w-3 h-3" />
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Other / custom topic */}
                            <div className="mt-3">
                                {!isAddingCustom ? (
                                    <button
                                        onClick={() => setIsAddingCustom(true)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-dashed border-zinc-700 hover:border-zinc-500 transition-colors"
                                    >
                                        <Plus className="w-3 h-3" />
                                        Other topic
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <input
                                            ref={customInputRef}
                                            type="text"
                                            value={customName}
                                            onChange={(e) => setCustomName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") addCustomTopic();
                                                if (e.key === "Escape") {
                                                    setIsAddingCustom(false);
                                                    setCustomName("");
                                                }
                                            }}
                                            placeholder="Type topic name..."
                                            className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                        />
                                        <button
                                            onClick={addCustomTopic}
                                            disabled={!customName.trim()}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-40"
                                        >
                                            Add
                                        </button>
                                        <button
                                            onClick={() => { setIsAddingCustom(false); setCustomName(""); }}
                                            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
                        <button
                            onClick={handleGenerate}
                            disabled={isLoading || topics.length === 0}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-600/20"
                        >
                            {isLoading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4" />
                                    Generate
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
