"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import {
    X,
    Sparkles,
    Brain,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Loader2,
    ChevronDown,
    ChevronUp,
    RefreshCw,
} from "lucide-react";
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Tooltip,
} from "recharts";

// ============================================================
// Types
// ============================================================

interface BloomsQuestion {
    question_text: string;
    blooms_level: string;
    options: string[] | null;
    correct_answer: string;
    explanation: string;
    source_reference: string;
    difficulty: string;
    question_type: string;
    // UI state
    accepted: boolean;
    verification_status: "pending" | "verified" | "warning" | "wrong";
    verification_reason: string;
}

interface BloomsDistribution {
    remember: number;
    understand: number;
    apply: number;
    analyze: number;
    evaluate: number;
    create: number;
}

interface AutoBloomsParams {
    milestoneId?: string;
    numQuestions: number;
    difficulty: string;
    questionTypes: string[];
    bloomDistribution: BloomsDistribution;
    learningContent?: string;
}

interface BloomsTaxonomyGeneratorProps {
    open: boolean;
    onClose: () => void;
    onAddQuestions: (questions: BloomsQuestion[]) => void;
    courseId: string;
    milestoneId?: string;
    milestones: Array<{ id: string; name: string; learning_material_count: number }>;
    autoStart?: boolean;
    autoParams?: AutoBloomsParams;
}

// ============================================================
// Constants
// ============================================================

const BLOOMS_LEVELS = [
    { key: "remember", label: "Remember", color: "#60a5fa", description: "Recall facts" },
    { key: "understand", label: "Understand", color: "#34d399", description: "Explain ideas" },
    { key: "apply", label: "Apply", color: "#fbbf24", description: "Use in new situations" },
    { key: "analyze", label: "Analyze", color: "#f97316", description: "Draw connections" },
    { key: "evaluate", label: "Evaluate", color: "#a78bfa", description: "Justify decisions" },
    { key: "create", label: "Create", color: "#f472b6", description: "Produce original work" },
];

const DIFFICULTY_OPTIONS = [
    { value: "easy", label: "Easy", emoji: "🟢" },
    { value: "medium", label: "Medium", emoji: "🟡" },
    { value: "hard", label: "Hard", emoji: "🔴" },
];

// ============================================================
// Component
// ============================================================

export default function BloomsTaxonomyGenerator({
    open,
    onClose,
    onAddQuestions,
    courseId,
    milestoneId: initialMilestoneId,
    milestones,
    autoStart = false,
    autoParams,
}: BloomsTaxonomyGeneratorProps) {
    // --- State ---
    const [selectedMilestoneId, setSelectedMilestoneId] = useState(
        initialMilestoneId || (milestones.length > 0 ? milestones[0].id : "")
    );
    const [numQuestions, setNumQuestions] = useState(10);
    const [difficulty, setDifficulty] = useState("medium");
    const [questionTypes, setQuestionTypes] = useState(["objective"]);
    const [distribution, setDistribution] = useState<BloomsDistribution>({
        remember: 20,
        understand: 20,
        apply: 20,
        analyze: 20,
        evaluate: 10,
        create: 10,
    });

    const [isGenerating, setIsGenerating] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState<BloomsQuestion[]>([]);
    const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [extractedContent, setExtractedContent] = useState<string>("");

    const abortControllerRef = useRef<AbortController | null>(null);

    // Auto-select first milestone when milestones are loaded asynchronously
    useEffect(() => {
        if (milestones.length > 0 && !selectedMilestoneId) {
            setSelectedMilestoneId(milestones[0].id);
        }
    }, [milestones, selectedMilestoneId]);

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setGeneratedQuestions([]);
            setError(null);
            setIsGenerating(false);
            setIsVerifying(false);
            if (initialMilestoneId) {
                setSelectedMilestoneId(initialMilestoneId);
            } else if (milestones.length > 0) {
                setSelectedMilestoneId(milestones[0].id);
            }
        }
    }, [open, initialMilestoneId, milestones]);

    // --- Auto-start when triggered from wizard ---
    useEffect(() => {
        if (open && autoStart && autoParams) {
            handleGenerate(autoParams);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // --- Slider Logic ---
    const handleSliderChange = useCallback(
        (key: string, newValue: number) => {
            setDistribution((prev) => {
                const updated = { ...prev, [key]: newValue };
                const total = Object.values(updated).reduce((sum, v) => sum + v, 0);

                // If total exceeds 100, reduce other sliders proportionally
                if (total > 100) {
                    const excess = total - 100;
                    const otherKeys = Object.keys(updated).filter((k) => k !== key);
                    const otherTotal = otherKeys.reduce(
                        (sum, k) => sum + updated[k as keyof BloomsDistribution],
                        0
                    );

                    if (otherTotal > 0) {
                        otherKeys.forEach((k) => {
                            const proportion =
                                updated[k as keyof BloomsDistribution] / otherTotal;
                            updated[k as keyof BloomsDistribution] = Math.max(
                                0,
                                Math.round(
                                    updated[k as keyof BloomsDistribution] - excess * proportion
                                )
                            );
                        });
                    }
                }

                return updated;
            });
        },
        []
    );

    // --- Radar Chart Data ---
    const getRadarData = useCallback(() => {
        const accepted = generatedQuestions.filter((q) => q.accepted);
        const counts: Record<string, number> = {};
        BLOOMS_LEVELS.forEach((level) => {
            counts[level.key] = accepted.filter(
                (q) => q.blooms_level === level.key
            ).length;
        });

        return BLOOMS_LEVELS.map((level) => ({
            level: level.label,
            count: counts[level.key] || 0,
            fullMark: Math.max(
                Math.ceil(numQuestions * (distribution[level.key as keyof BloomsDistribution] / 100)),
                1
            ),
        }));
    }, [generatedQuestions, numQuestions, distribution]);

    // --- Generate Assessment ---
    const handleGenerate = useCallback(async (override?: AutoBloomsParams) => {
        const mid = override?.milestoneId || selectedMilestoneId;
        const nq = override?.numQuestions ?? numQuestions;
        const diff = override?.difficulty || difficulty;
        const qt = override?.questionTypes || questionTypes;
        const dist = override?.bloomDistribution || distribution;

        if (!mid) {
            setError("Please select a module first.");
            return;
        }

        setIsGenerating(true);
        setError(null);
        setGeneratedQuestions([]);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/assessment/generate-blooms`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        course_id: parseInt(courseId),
                        milestone_id: parseInt(mid),
                        num_questions: nq,
                        difficulty: diff,
                        question_types: qt,
                        bloom_distribution: dist,
                    }),
                    signal: controller.signal,
                }
            );

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Server error: ${response.status}`);
            }

            // Parse NDJSON stream
            const reader = response.body?.getReader();
            if (!reader) throw new Error("Failed to start streaming");

            const decoder = new TextDecoder();
            let buffer = "";
            let latestQuestions: BloomsQuestion[] = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);

                        if (parsed.error) {
                            setError(parsed.error);
                            continue;
                        }

                        if (parsed.questions) {
                            latestQuestions = parsed.questions
                                .filter((q: any) => q && q.question_text)
                                .map((q: any) => ({
                                    ...q,
                                    accepted: true,
                                    verification_status: "pending" as const,
                                    verification_reason: "",
                                }));
                            setGeneratedQuestions([...latestQuestions]);
                        }
                    } catch {
                        // Partial JSON, skip
                    }
                }
            }

            // After generation, trigger verification
            if (latestQuestions.length > 0) {
                await verifyQuestions(latestQuestions, mid);
            }
        } catch (err: any) {
            if (err.name !== "AbortError") {
                setError(err.message || "Failed to generate assessment");
            }
        } finally {
            setIsGenerating(false);
        }
    }, [courseId, selectedMilestoneId, numQuestions, difficulty, questionTypes, distribution]);

    // --- Verify Questions ---
    const verifyQuestions = useCallback(
        async (questions: BloomsQuestion[], milestoneOverride?: string) => {
            const mid = milestoneOverride || selectedMilestoneId;
            setIsVerifying(true);

            try {
                // First, extract content for verification context
                const contentRes = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}/assessment/extract-content?course_id=${courseId}&milestone_id=${mid}`,
                    { method: "POST" }
                );

                if (!contentRes.ok) {
                    console.warn("Could not extract content for verification");
                    setIsVerifying(false);
                    return;
                }

                const contentData = await contentRes.json();

                const verifyRes = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}/assessment/verify-questions`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            questions: questions.map((q) => ({
                                question_text: q.question_text,
                                blooms_level: q.blooms_level,
                                options: q.options,
                                correct_answer: q.correct_answer,
                                explanation: q.explanation,
                                source_reference: q.source_reference,
                                difficulty: q.difficulty,
                                question_type: q.question_type,
                            })),
                            learning_material_content: contentData.content,
                        }),
                    }
                );

                if (verifyRes.ok) {
                    const verifyData = await verifyRes.json();

                    if (verifyData.results) {
                        setGeneratedQuestions((prev) => {
                            const updated = [...prev];
                            verifyData.results.forEach((result: any) => {
                                if (result.question_index < updated.length) {
                                    updated[result.question_index] = {
                                        ...updated[result.question_index],
                                        verification_status: result.status,
                                        verification_reason: result.reason,
                                        // Auto-reject questions flagged as "wrong"
                                        accepted:
                                            result.status === "wrong"
                                                ? false
                                                : updated[result.question_index].accepted,
                                    };
                                }
                            });
                            return updated;
                        });
                    }
                }
            } catch (err) {
                console.warn("Verification failed:", err);
            } finally {
                setIsVerifying(false);
            }
        },
        [courseId, selectedMilestoneId]
    );

    // --- Toggle Accept/Reject ---
    const toggleQuestion = useCallback((index: number) => {
        setGeneratedQuestions((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], accepted: !updated[index].accepted };
            return updated;
        });
    }, []);

    // --- Add Selected to Quiz ---
    const handleAddToQuiz = useCallback(() => {
        const accepted = generatedQuestions.filter((q) => q.accepted);
        if (accepted.length === 0) {
            setError("Please accept at least one question.");
            return;
        }
        onAddQuestions(accepted);
        onClose();
    }, [generatedQuestions, onAddQuestions, onClose]);

    // --- Counts ---
    const acceptedCount = generatedQuestions.filter((q) => q.accepted).length;
    const totalCount = generatedQuestions.length;
    const verifiedCount = generatedQuestions.filter(
        (q) => q.verification_status === "verified"
    ).length;
    const warningCount = generatedQuestions.filter(
        (q) => q.verification_status === "warning"
    ).length;
    const wrongCount = generatedQuestions.filter(
        (q) => q.verification_status === "wrong"
    ).length;

    // --- Verification status badge ---
    const getVerificationBadge = (status: string, reason: string) => {
        switch (status) {
            case "verified":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" title={reason}>
                        <CheckCircle2 size={12} /> Verified
                    </span>
                );
            case "warning":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" title={reason}>
                        <AlertTriangle size={12} /> Warning
                    </span>
                );
            case "wrong":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" title={reason}>
                        <XCircle size={12} /> Issue Found
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        <Loader2 size={12} className="animate-spin" /> Validating...
                    </span>
                );
        }
    };

    // --- Bloom's Level Badge ---
    const getBloomsBadge = (level: string) => {
        const info = BLOOMS_LEVELS.find((l) => l.key === level);
        if (!info) return null;
        return (
            <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: `${info.color}22`, color: info.color }}
            >
                {info.label}
            </span>
        );
    };

    const totalDistribution = Object.values(distribution).reduce((s, v) => s + v, 0);

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-4xl transform rounded-2xl bg-white dark:bg-[#1a1a1a] shadow-2xl transition-all max-h-[90vh] flex flex-col">
                                {/* Header */}
                                <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                            <Brain size={20} className="text-white" />
                                        </div>
                                        <div>
                                            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                                                Bloom&apos;s Taxonomy Generator
                                            </Dialog.Title>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                AI-powered assessment with cognitive level tagging
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        <X size={20} className="text-gray-500" />
                                    </button>
                                </div>

                                {/* Scrollable Content */}
                                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                                    {/* Configuration Section */}
                                    {generatedQuestions.length === 0 && !autoStart && (
                                        <>
                                            {/* Module Selector */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Select Module
                                                </label>
                                                <select
                                                    value={selectedMilestoneId}
                                                    onChange={(e) => setSelectedMilestoneId(e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#222] text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                                >
                                                    {milestones.map((m) => (
                                                        <option key={m.id} value={m.id}>
                                                            {m.name}{" "}
                                                            ({m.learning_material_count} materials)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Row: Questions count + Difficulty */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Number of Questions
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={30}
                                                        value={numQuestions}
                                                        onChange={(e) =>
                                                            setNumQuestions(
                                                                Math.min(30, Math.max(1, parseInt(e.target.value) || 5))
                                                            )
                                                        }
                                                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#222] text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Difficulty
                                                    </label>
                                                    <div className="flex gap-2">
                                                        {DIFFICULTY_OPTIONS.map((opt) => (
                                                            <button
                                                                key={opt.value}
                                                                onClick={() => setDifficulty(opt.value)}
                                                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${difficulty === opt.value
                                                                    ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-2 ring-violet-500"
                                                                    : "bg-gray-100 dark:bg-[#222] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                                                    }`}
                                                            >
                                                                {opt.emoji} {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Question Type */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Question Type
                                                </label>
                                                <div className="flex gap-2">
                                                    {[
                                                        { value: "objective", label: "Objective (MCQ)" },
                                                        { value: "subjective", label: "Subjective" },
                                                    ].map((opt) => (
                                                        <button
                                                            key={opt.value}
                                                            onClick={() => {
                                                                setQuestionTypes((prev) =>
                                                                    prev.includes(opt.value)
                                                                        ? prev.filter((t) => t !== opt.value)
                                                                        : [...prev, opt.value]
                                                                );
                                                            }}
                                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${questionTypes.includes(opt.value)
                                                                ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-2 ring-violet-500"
                                                                : "bg-gray-100 dark:bg-[#222] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                                                }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Bloom's Distribution Sliders */}
                                            <div>
                                                <div className="flex items-center justify-between mb-3">
                                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        Bloom&apos;s Taxonomy Distribution
                                                    </label>
                                                    <span
                                                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${totalDistribution === 100
                                                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                            }`}
                                                    >
                                                        Total: {totalDistribution}%
                                                    </span>
                                                </div>

                                                <div className="space-y-3">
                                                    {BLOOMS_LEVELS.map((level) => (
                                                        <div key={level.key} className="flex items-center gap-3">
                                                            <div className="w-24 flex items-center gap-2">
                                                                <div
                                                                    className="w-3 h-3 rounded-full"
                                                                    style={{ backgroundColor: level.color }}
                                                                />
                                                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                                                    {level.label}
                                                                </span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min={0}
                                                                max={100}
                                                                step={5}
                                                                value={
                                                                    distribution[
                                                                    level.key as keyof BloomsDistribution
                                                                    ]
                                                                }
                                                                onChange={(e) =>
                                                                    handleSliderChange(
                                                                        level.key,
                                                                        parseInt(e.target.value)
                                                                    )
                                                                }
                                                                className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
                                                                style={{
                                                                    background: `linear-gradient(to right, ${level.color} ${distribution[level.key as keyof BloomsDistribution]
                                                                        }%, #e5e7eb ${distribution[level.key as keyof BloomsDistribution]
                                                                        }%)`,
                                                                }}
                                                            />
                                                            <span className="w-10 text-right text-xs font-mono text-gray-600 dark:text-gray-400">
                                                                {distribution[level.key as keyof BloomsDistribution]}%
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Error */}
                                    {error && (
                                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                                            {error}
                                        </div>
                                    )}

                                    {/* Generated Questions */}
                                    {generatedQuestions.length > 0 && (
                                        <div className="space-y-4">
                                            {/* Stats Bar */}
                                            <div className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-[#222] border border-gray-200 dark:border-gray-700">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <span className="text-gray-500 dark:text-gray-400">Total:</span>
                                                    <span className="font-semibold text-gray-900 dark:text-white">{totalCount}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <span className="text-green-600 dark:text-green-400">✓ Accepted:</span>
                                                    <span className="font-semibold text-green-700 dark:text-green-300">{acceptedCount}</span>
                                                </div>
                                                {isVerifying && (
                                                    <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
                                                        <Loader2 size={14} className="animate-spin" />
                                                        Verifying with AI...
                                                    </div>
                                                )}
                                                {!isVerifying && verifiedCount > 0 && (
                                                    <>
                                                        <div className="flex items-center gap-1 text-sm text-green-600">
                                                            <CheckCircle2 size={14} /> {verifiedCount} verified
                                                        </div>
                                                        {warningCount > 0 && (
                                                            <div className="flex items-center gap-1 text-sm text-yellow-600">
                                                                <AlertTriangle size={14} /> {warningCount} warnings
                                                            </div>
                                                        )}
                                                        {wrongCount > 0 && (
                                                            <div className="flex items-center gap-1 text-sm text-red-600">
                                                                <XCircle size={14} /> {wrongCount} issues
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            {/* Layout: Questions + Radar */}
                                            <div className="grid grid-cols-3 gap-4">
                                                {/* Questions List */}
                                                <div className="col-span-2 space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                                    {generatedQuestions.map((q, idx) => (
                                                        <div
                                                            key={idx}
                                                            className={`rounded-xl border transition-all ${q.accepted
                                                                ? "border-green-300 dark:border-green-700 bg-white dark:bg-[#1e1e1e]"
                                                                : "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 opacity-60"
                                                                }`}
                                                        >
                                                            {/* Question Header */}
                                                            <div className="flex items-center justify-between p-3">
                                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                                                                        Q{idx + 1}
                                                                    </span>
                                                                    {getBloomsBadge(q.blooms_level)}
                                                                    {getVerificationBadge(
                                                                        q.verification_status,
                                                                        q.verification_reason
                                                                    )}
                                                                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                                                                        {q.question_text}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-1 ml-2">
                                                                    <button
                                                                        onClick={() =>
                                                                            setExpandedQuestion(
                                                                                expandedQuestion === idx ? null : idx
                                                                            )
                                                                        }
                                                                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                                                    >
                                                                        {expandedQuestion === idx ? (
                                                                            <ChevronUp size={16} className="text-gray-500" />
                                                                        ) : (
                                                                            <ChevronDown size={16} className="text-gray-500" />
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => toggleQuestion(idx)}
                                                                        className={`p-1.5 rounded-lg text-xs font-medium transition-all ${q.accepted
                                                                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400"
                                                                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-400"
                                                                            }`}
                                                                    >
                                                                        {q.accepted ? (
                                                                            <CheckCircle2 size={16} />
                                                                        ) : (
                                                                            <XCircle size={16} />
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Expanded Details */}
                                                            {expandedQuestion === idx && (
                                                                <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
                                                                    <p className="text-sm text-gray-800 dark:text-gray-200">
                                                                        {q.question_text}
                                                                    </p>

                                                                    {q.options && q.options.length > 0 && (
                                                                        <div className="space-y-1">
                                                                            {q.options.map((opt, oi) => (
                                                                                <div
                                                                                    key={oi}
                                                                                    className={`text-xs px-2 py-1 rounded ${opt === q.correct_answer
                                                                                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 font-medium"
                                                                                        : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                                                                        }`}
                                                                                >
                                                                                    {String.fromCharCode(65 + oi)}. {opt}
                                                                                    {opt === q.correct_answer && " ✓"}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                                                        <strong>Explanation:</strong> {q.explanation}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                        <strong>Source:</strong> {q.source_reference}
                                                                    </div>

                                                                    {q.verification_reason && (
                                                                        <div className="text-xs mt-1 p-2 rounded bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                                                            <strong>AI Verification:</strong>{" "}
                                                                            {q.verification_reason}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Radar Chart */}
                                                <div className="col-span-1">
                                                    <div className="sticky top-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#222] p-4">
                                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 text-center">
                                                            Cognitive Coverage
                                                        </h3>
                                                        <ResponsiveContainer width="100%" height={220}>
                                                            <RadarChart
                                                                cx="50%"
                                                                cy="50%"
                                                                outerRadius="70%"
                                                                data={getRadarData()}
                                                            >
                                                                <PolarGrid
                                                                    stroke="#374151"
                                                                    strokeOpacity={0.3}
                                                                />
                                                                <PolarAngleAxis
                                                                    dataKey="level"
                                                                    tick={{
                                                                        fill: "#9ca3af",
                                                                        fontSize: 11,
                                                                    }}
                                                                />
                                                                <PolarRadiusAxis
                                                                    tick={false}
                                                                    axisLine={false}
                                                                />
                                                                <Radar
                                                                    name="Coverage"
                                                                    dataKey="count"
                                                                    stroke="#8b5cf6"
                                                                    fill="#8b5cf6"
                                                                    fillOpacity={0.3}
                                                                />
                                                            </RadarChart>
                                                        </ResponsiveContainer>

                                                        {/* Level breakdown */}
                                                        <div className="space-y-1 mt-3">
                                                            {BLOOMS_LEVELS.map((level) => {
                                                                const count = generatedQuestions.filter(
                                                                    (q) =>
                                                                        q.accepted && q.blooms_level === level.key
                                                                ).length;
                                                                return (
                                                                    <div
                                                                        key={level.key}
                                                                        className="flex items-center justify-between text-xs"
                                                                    >
                                                                        <div className="flex items-center gap-1.5">
                                                                            <div
                                                                                className="w-2 h-2 rounded-full"
                                                                                style={{ backgroundColor: level.color }}
                                                                            />
                                                                            <span className="text-gray-600 dark:text-gray-400">
                                                                                {level.label}
                                                                            </span>
                                                                        </div>
                                                                        <span
                                                                            className={`font-mono ${count === 0
                                                                                ? "text-red-500"
                                                                                : "text-gray-700 dark:text-gray-300"
                                                                                }`}
                                                                        >
                                                                            {count}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    {generatedQuestions.length === 0 && !autoStart ? (
                                        <>
                                            <button
                                                onClick={onClose}
                                                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleGenerate}
                                                disabled={isGenerating || totalDistribution !== 100 || questionTypes.length === 0}
                                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium text-sm hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/25"
                                            >
                                                {isGenerating ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        Generating...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles size={16} />
                                                        Generate Assessment
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => {
                                                    setGeneratedQuestions([]);
                                                    setError(null);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                                            >
                                                <RefreshCw size={14} />
                                                Regenerate
                                            </button>
                                            <button
                                                onClick={handleAddToQuiz}
                                                disabled={acceptedCount === 0}
                                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium text-sm hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-green-500/25"
                                            >
                                                <CheckCircle2 size={16} />
                                                Add {acceptedCount} Questions to Quiz
                                            </button>
                                        </>
                                    )}
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
