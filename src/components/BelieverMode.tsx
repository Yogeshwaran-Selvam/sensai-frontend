"use client";

import { useState, useCallback, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import {
    X,
    Sparkles,
    Shield,
    CheckCircle2,
    XCircle,
    Loader2,
    ChevronRight,
    BarChart3,
    Target,
    TrendingUp,
    ArrowRight,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface TopicResult {
    keyword: string;
    status: "pending" | "strong" | "moderate" | "basic" | "weak";
    passed_at?: string;
}

interface QuestionData {
    question_text: string;
    options: string[];
    correct_answer: string;
    explanation: string;
    topic: string;
    difficulty: string;
}

interface ReportData {
    overall_assessment: string;
    study_recommendations: string[];
    topic_mastery: Array<{ keyword: string; status: string; score: number }>;
    overall_score: number;
}

interface BelieverModeProps {
    open: boolean;
    onClose: () => void;
    courseId: string;
    milestones: Array<{ id: string; name: string; learning_material_count: number }>;
}

// ============================================================
// Constants
// ============================================================

const MASTERY_CONFIG: Record<string, { label: string; color: string; barColor: string; emoji: string }> = {
    strong: { label: "Strong", color: "text-green-500", barColor: "bg-green-500", emoji: "💪" },
    moderate: { label: "Moderate", color: "text-blue-500", barColor: "bg-blue-500", emoji: "👍" },
    basic: { label: "Basic", color: "text-yellow-500", barColor: "bg-yellow-500", emoji: "🤏" },
    weak: { label: "Needs Work", color: "text-red-500", barColor: "bg-red-500", emoji: "📚" },
    pending: { label: "Pending", color: "text-gray-400", barColor: "bg-gray-300", emoji: "⏳" },
};

const DIFFICULTY_STYLE: Record<string, { label: string; bg: string }> = {
    hard: { label: "Hard", bg: "bg-red-500/10 text-red-500 border-red-500/30" },
    medium: { label: "Medium", bg: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
    easy: { label: "Easy", bg: "bg-green-500/10 text-green-500 border-green-500/30" },
};

// ============================================================
// Component
// ============================================================

export default function BelieverMode({
    open,
    onClose,
    courseId,
    milestones,
}: BelieverModeProps) {
    // --- Phase state ---
    type Phase = "config" | "playing" | "feedback" | "report";
    const [phase, setPhase] = useState<Phase>("config");

    // --- Config ---
    const [selectedMilestoneId, setSelectedMilestoneId] = useState(
        milestones.length > 0 ? milestones[0].id : ""
    );

    // --- Session state ---
    const [topics, setTopics] = useState<TopicResult[]>([]);
    const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
    const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
    const [currentDifficulty, setCurrentDifficulty] = useState("hard");
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [learningContent, setLearningContent] = useState("");

    // --- Feedback state ---
    const [lastFeedback, setLastFeedback] = useState("");
    const [lastWasCorrect, setLastWasCorrect] = useState(false);
    const [lastExplanation, setLastExplanation] = useState("");

    // --- Results ---
    const [topicResults, setTopicResults] = useState<TopicResult[]>([]);
    const [totalCorrect, setTotalCorrect] = useState(0);
    const [totalAttempts, setTotalAttempts] = useState(0);
    const [report, setReport] = useState<ReportData | null>(null);

    // --- Loading ---
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset when dialog opens
    useEffect(() => {
        if (open) {
            setPhase("config");
            setTopics([]);
            setCurrentQuestion(null);
            setTopicResults([]);
            setTotalCorrect(0);
            setTotalAttempts(0);
            setReport(null);
            setError(null);
            setSelectedOption(null);
            if (milestones.length > 0) {
                setSelectedMilestoneId(milestones[0].id);
            }
        }
    }, [open, milestones]);

    // ============================================================
    // START SESSION
    // ============================================================
    const startSession = useCallback(async () => {
        if (!selectedMilestoneId) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/believer/start`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        course_id: parseInt(courseId),
                        milestone_id: parseInt(selectedMilestoneId),
                    }),
                }
            );

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || `Server error: ${res.status}`);
            }

            const data = await res.json();

            setTopics(data.topics);
            setCurrentTopicIndex(0);
            setCurrentQuestion(data.first_question);
            setCurrentDifficulty("hard");
            setLearningContent(data.learning_content);
            setPhase("playing");
        } catch (err: any) {
            setError(err.message || "Failed to start session");
        } finally {
            setIsLoading(false);
        }
    }, [courseId, selectedMilestoneId]);

    // ============================================================
    // SUBMIT ANSWER
    // ============================================================
    const submitAnswer = useCallback(async () => {
        if (!selectedOption || !currentQuestion) return;

        setIsLoading(true);

        const wasCorrect = selectedOption === currentQuestion.correct_answer;
        const currentTopic = currentQuestion.topic;

        setTotalAttempts((p) => p + 1);
        if (wasCorrect) setTotalCorrect((p) => p + 1);

        // Build remaining topics (all topics after current that haven't been completed)
        const completedTopics = new Set(topicResults.map((r) => r.keyword));
        completedTopics.add(currentTopic); // current topic is being processed
        const remaining = topics
            .map((t) => t.keyword)
            .filter((kw) => !completedTopics.has(kw));

        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/believer/next`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        course_id: parseInt(courseId),
                        milestone_id: parseInt(selectedMilestoneId),
                        selected_option: selectedOption,
                        correct_answer: currentQuestion.correct_answer,
                        current_topic: currentTopic,
                        current_difficulty: currentDifficulty,
                        was_correct: wasCorrect,
                        remaining_topics: remaining,
                        questions_asked: totalAttempts + 1,
                    }),
                }
            );

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to process answer");
            }

            const data = await res.json();

            // Show feedback
            setLastFeedback(data.feedback);
            setLastWasCorrect(wasCorrect);
            setLastExplanation(currentQuestion.explanation);

            // Track topic result if completed
            if (data.topic_result) {
                setTopicResults((prev) => [...prev, data.topic_result]);
                // Update topics state
                setTopics((prev) =>
                    prev.map((t) =>
                        t.keyword === data.topic_result.keyword
                            ? { ...t, status: data.topic_result.status }
                            : t
                    )
                );
            }

            if (data.is_session_complete) {
                // Show feedback first, then go to report
                setPhase("feedback");
                // Store that session is complete so feedback phase knows
                setCurrentQuestion(null);
                setTimeout(async () => {
                    await generateReport(data.topic_result);
                }, 0);
            } else {
                // Show feedback, then load next question
                setCurrentQuestion(data.next_question);
                setCurrentDifficulty(data.next_difficulty);
                setPhase("feedback");
            }

            setSelectedOption(null);
        } catch (err: any) {
            setError(err.message || "Failed to submit answer");
        } finally {
            setIsLoading(false);
        }
    }, [selectedOption, currentQuestion, currentDifficulty, courseId, selectedMilestoneId, topics, topicResults]);

    // ============================================================
    // GENERATE REPORT
    // ============================================================
    const generateReport = useCallback(
        async (lastTopicResult?: TopicResult) => {
            setIsLoading(true);

            const allResults = lastTopicResult
                ? [...topicResults, lastTopicResult]
                : topicResults;

            const selectedMilestone = milestones.find(
                (m) => m.id === selectedMilestoneId
            );

            try {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}/believer/report`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            module_name: selectedMilestone?.name || "Module",
                            topic_results: allResults,
                            correct_count: totalCorrect,
                            total_count: totalAttempts,
                        }),
                    }
                );

                if (res.ok) {
                    const data = await res.json();
                    setReport(data);
                }
            } catch (err) {
                console.warn("Report generation failed:", err);
            } finally {
                setIsLoading(false);
            }
        },
        [topicResults, totalCorrect, totalAttempts, milestones, selectedMilestoneId]
    );

    // ============================================================
    // CONTINUE FROM FEEDBACK
    // ============================================================
    const continueFromFeedback = useCallback(() => {
        if (!currentQuestion) {
            // Session complete, show report
            setPhase("report");
        } else {
            setPhase("playing");
        }
    }, [currentQuestion]);

    // ============================================================
    // Computed
    // ============================================================
    const completedCount = topicResults.length;
    const totalTopics = topics.length;
    const progressPct = totalTopics > 0 ? (completedCount / totalTopics) * 100 : 0;

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
                            <Dialog.Panel className="w-full max-w-2xl transform rounded-2xl bg-white dark:bg-[#1a1a1a] shadow-2xl transition-all max-h-[90vh] flex flex-col">
                                {/* Header */}
                                <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                                            <Shield size={20} className="text-white" />
                                        </div>
                                        <div>
                                            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                                                Believer Mode
                                            </Dialog.Title>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Adaptive diagnostic practice
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

                                {/* Content */}
                                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                    {error && (
                                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                                            {error}
                                        </div>
                                    )}

                                    {/* ======== CONFIG PHASE ======== */}
                                    {phase === "config" && (
                                        <div className="space-y-6">
                                            <div className="text-center py-4">
                                                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4">
                                                    <Target size={32} className="text-white" />
                                                </div>
                                                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                                    Test Your Understanding
                                                </h3>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                                                    AI will adaptively quiz you on each topic in the module.
                                                    Questions get easier if you struggle — at the end, you&apos;ll see exactly where you&apos;re strong and where to improve.
                                                </p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Select Module to Practice
                                                </label>
                                                <select
                                                    value={selectedMilestoneId}
                                                    onChange={(e) => setSelectedMilestoneId(e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#222] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                                >
                                                    {milestones.map((m) => (
                                                        <option key={m.id} value={m.id}>
                                                            {m.name} ({m.learning_material_count} materials)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4">
                                                <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-2">How it works:</h4>
                                                <ul className="space-y-1 text-xs text-emerald-700 dark:text-emerald-400">
                                                    <li>🔴 Each topic starts with a <strong>Hard</strong> question</li>
                                                    <li>✅ Get it right → you&apos;re <strong>Strong</strong> in that topic</li>
                                                    <li>❌ Get it wrong → try a <strong>Medium</strong> question</li>
                                                    <li>❌ Wrong again → try an <strong>Easy</strong> question</li>
                                                    <li>📊 At the end, see your <strong>topic-by-topic mastery</strong></li>
                                                </ul>
                                            </div>
                                        </div>
                                    )}

                                    {/* ======== PLAYING PHASE ======== */}
                                    {phase === "playing" && currentQuestion && (
                                        <div className="space-y-5">
                                            {/* Progress bar */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        Topic {completedCount + 1} of {totalTopics}
                                                    </span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${DIFFICULTY_STYLE[currentDifficulty]?.bg || ""}`}>
                                                        {DIFFICULTY_STYLE[currentDifficulty]?.label || currentDifficulty}
                                                    </span>
                                                </div>
                                                <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700">
                                                    <div
                                                        className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                                                        style={{ width: `${progressPct}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Topic badge */}
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                                                    <Target size={12} className="mr-1" />
                                                    {currentQuestion.topic}
                                                </span>
                                            </div>

                                            {/* Question */}
                                            <div className="rounded-xl bg-gray-50 dark:bg-[#222] border border-gray-200 dark:border-gray-700 p-4">
                                                <p className="text-base text-gray-900 dark:text-white leading-relaxed">
                                                    {currentQuestion.question_text}
                                                </p>
                                            </div>

                                            {/* Options */}
                                            <div className="space-y-2">
                                                {currentQuestion.options.map((opt, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedOption(opt)}
                                                        disabled={isLoading}
                                                        className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm ${selectedOption === opt
                                                                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100 ring-1 ring-emerald-500"
                                                                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                                                            }`}
                                                    >
                                                        <span className="font-semibold text-gray-400 mr-2">
                                                            {String.fromCharCode(65 + idx)}.
                                                        </span>
                                                        {opt}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Topic progress dots */}
                                            <div className="flex items-center justify-center gap-1.5 pt-2">
                                                {topics.map((t, i) => {
                                                    const config = MASTERY_CONFIG[t.status];
                                                    return (
                                                        <div
                                                            key={i}
                                                            title={`${t.keyword}: ${config.label}`}
                                                            className={`w-3 h-3 rounded-full transition-all ${t.status === "pending"
                                                                    ? i === completedCount
                                                                        ? "bg-emerald-500 animate-pulse ring-2 ring-emerald-300"
                                                                        : "bg-gray-300 dark:bg-gray-600"
                                                                    : config.barColor
                                                                }`}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* ======== FEEDBACK PHASE ======== */}
                                    {phase === "feedback" && (
                                        <div className="space-y-5 text-center">
                                            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${lastWasCorrect
                                                    ? "bg-green-100 dark:bg-green-900/30"
                                                    : "bg-red-100 dark:bg-red-900/30"
                                                }`}>
                                                {lastWasCorrect ? (
                                                    <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />
                                                ) : (
                                                    <XCircle size={32} className="text-red-600 dark:text-red-400" />
                                                )}
                                            </div>

                                            <p className={`text-lg font-semibold ${lastWasCorrect
                                                    ? "text-green-700 dark:text-green-400"
                                                    : "text-red-700 dark:text-red-400"
                                                }`}>
                                                {lastFeedback}
                                            </p>

                                            <div className="rounded-xl bg-gray-50 dark:bg-[#222] border border-gray-200 dark:border-gray-700 p-4 text-left">
                                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Explanation:</p>
                                                <p className="text-sm text-gray-700 dark:text-gray-300">{lastExplanation}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* ======== REPORT PHASE ======== */}
                                    {phase === "report" && (
                                        <div className="space-y-6">
                                            <div className="text-center">
                                                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-3">
                                                    <BarChart3 size={28} className="text-white" />
                                                </div>
                                                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                                                    Your Diagnostic Report
                                                </h3>
                                            </div>

                                            {isLoading && !report && (
                                                <div className="flex items-center justify-center py-8">
                                                    <Loader2 size={24} className="animate-spin text-emerald-500 mr-3" />
                                                    <span className="text-gray-500">Generating your report...</span>
                                                </div>
                                            )}

                                            {report && (
                                                <>
                                                    {/* Overall score */}
                                                    <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 p-5 text-white text-center">
                                                        <p className="text-4xl font-bold">{report.overall_score.toFixed(0)}%</p>
                                                        <p className="text-sm opacity-90 mt-1">Overall Score</p>
                                                    </div>

                                                    {/* Topic mastery bars */}
                                                    <div className="space-y-3">
                                                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                                            <TrendingUp size={14} />
                                                            Topic Mastery
                                                        </h4>
                                                        {report.topic_mastery.map((tm, i) => {
                                                            const config = MASTERY_CONFIG[tm.status] || MASTERY_CONFIG.pending;
                                                            return (
                                                                <div key={i} className="space-y-1">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-sm text-gray-700 dark:text-gray-300">{tm.keyword}</span>
                                                                        <span className={`text-xs font-semibold ${config.color}`}>
                                                                            {config.emoji} {config.label}
                                                                        </span>
                                                                    </div>
                                                                    <div className="w-full h-2.5 rounded-full bg-gray-200 dark:bg-gray-700">
                                                                        <div
                                                                            className={`h-2.5 rounded-full ${config.barColor} transition-all duration-700`}
                                                                            style={{ width: `${tm.score}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* AI Assessment */}
                                                    <div className="rounded-xl bg-gray-50 dark:bg-[#222] border border-gray-200 dark:border-gray-700 p-4">
                                                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                                            <Sparkles size={14} className="text-emerald-500" />
                                                            AI Assessment
                                                        </h4>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                                            {report.overall_assessment}
                                                        </p>
                                                    </div>

                                                    {/* Study recommendations */}
                                                    {report.study_recommendations.length > 0 && (
                                                        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4">
                                                            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                                                                📝 Study Recommendations
                                                            </h4>
                                                            <ul className="space-y-1">
                                                                {report.study_recommendations.map((rec, i) => (
                                                                    <li key={i} className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                                                                        <ChevronRight size={14} className="mt-0.5 flex-shrink-0" />
                                                                        {rec}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Loading overlay for question generation */}
                                    {isLoading && phase === "playing" && (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 size={24} className="animate-spin text-emerald-500 mr-3" />
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Processing...</span>
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    {phase === "config" && (
                                        <>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Practice mode — no grades, just learning
                                            </p>
                                            <button
                                                onClick={startSession}
                                                disabled={isLoading || !selectedMilestoneId}
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/25"
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        Starting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Shield size={16} />
                                                        Start Practice
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    )}

                                    {phase === "playing" && (
                                        <>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {totalCorrect}/{totalAttempts} correct so far
                                            </p>
                                            <button
                                                onClick={submitAnswer}
                                                disabled={!selectedOption || isLoading}
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/25"
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        Checking...
                                                    </>
                                                ) : (
                                                    <>
                                                        Submit Answer
                                                        <ArrowRight size={16} />
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    )}

                                    {phase === "feedback" && (
                                        <div className="w-full flex justify-center">
                                            <button
                                                onClick={continueFromFeedback}
                                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg shadow-emerald-500/25"
                                            >
                                                {currentQuestion ? (
                                                    <>
                                                        Next Question
                                                        <ArrowRight size={16} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <BarChart3 size={16} />
                                                        View Report
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {phase === "report" && (
                                        <div className="w-full flex justify-center">
                                            <button
                                                onClick={onClose}
                                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg shadow-emerald-500/25"
                                            >
                                                <CheckCircle2 size={16} />
                                                Done
                                            </button>
                                        </div>
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
