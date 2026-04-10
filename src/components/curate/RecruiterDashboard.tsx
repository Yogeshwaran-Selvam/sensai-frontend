"use client";

import { useCallback, useEffect, useState } from "react";
import {
    ArrowLeft,
    BarChart3,
    CheckCircle2,
    ChevronRight,
    Clock,
    ClipboardList,
    Copy,
    Check,
    Eye,
    Loader2,
    Search,
    Users,
    XCircle,
    Trophy,
    FileText,
    Code,
    AlertCircle,
    ThumbsUp,
    ThumbsDown,
    MessageSquare,
    Send,
    X,
} from "lucide-react";

interface TestSummary {
    id: number;
    test_code: string;
    title: string;
    question_count: number;
    created_at: string;
    attempt_total: number;
    attempt_submitted: number;
    attempt_in_progress: number;
    avg_score: number | null;
    max_score: number | null;
}

interface Attempt {
    id: number;
    test_id: number;
    candidate_name: string;
    candidate_email: string;
    answers: any[];
    score: number | null;
    max_score: number | null;
    status: string;
    started_at: string;
    submitted_at: string | null;
}

interface TestQuestion {
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

interface TestDetail {
    id: number;
    test_code: string;
    title: string;
    questions: TestQuestion[];
    question_count: number;
    status: string;
    created_at: string;
}

type View = "list" | "attempts" | "detail";

interface Props {
    orgId: number;
}

export default function RecruiterDashboard({ orgId }: Props) {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL;

    const [view, setView] = useState<View>("list");
    const [tests, setTests] = useState<TestSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Attempts view state
    const [selectedTest, setSelectedTest] = useState<TestSummary | null>(null);
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [attemptsLoading, setAttemptsLoading] = useState(false);

    // Detail view state
    const [selectedAttempt, setSelectedAttempt] = useState<Attempt | null>(null);
    const [testDetail, setTestDetail] = useState<TestDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [copied, setCopied] = useState<string | null>(null);

    const fetchTests = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${backend}/recruiter/tests?org_id=${orgId}`);
            if (!res.ok) throw new Error(`Failed to fetch tests (${res.status})`);
            const data = await res.json();
            setTests(data);
        } catch (e: any) {
            setError(e?.message || "Failed to load tests");
        } finally {
            setLoading(false);
        }
    }, [backend, orgId]);

    useEffect(() => {
        fetchTests();
    }, [fetchTests]);

    const openAttempts = async (test: TestSummary) => {
        setSelectedTest(test);
        setView("attempts");
        setAttemptsLoading(true);
        try {
            const res = await fetch(`${backend}/recruiter/tests/${test.id}/attempts`);
            if (!res.ok) throw new Error("Failed to load attempts");
            const data = await res.json();
            setAttempts(data);
        } catch (e: any) {
            setError(e?.message || "Failed to load attempts");
        } finally {
            setAttemptsLoading(false);
        }
    };

    const openDetail = async (attempt: Attempt) => {
        setSelectedAttempt(attempt);
        setView("detail");
        setDetailLoading(true);
        try {
            const res = await fetch(
                `${backend}/recruiter/tests/${attempt.test_id}/attempts/${attempt.id}`
            );
            if (!res.ok) throw new Error("Failed to load attempt details");
            const data = await res.json();
            setSelectedAttempt(data.attempt);
            setTestDetail(data.test);
        } catch (e: any) {
            setError(e?.message || "Failed to load details");
        } finally {
            setDetailLoading(false);
        }
    };

    const goBack = () => {
        if (view === "detail") {
            setView("attempts");
            setSelectedAttempt(null);
            setTestDetail(null);
        } else if (view === "attempts") {
            setView("list");
            setSelectedTest(null);
            setAttempts([]);
            fetchTests();
        }
    };

    const copyCode = async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(code);
            setTimeout(() => setCopied(null), 1500);
        } catch {}
    };

    const filteredTests = tests.filter(
        (t) =>
            t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.test_code.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalCandidates = tests.reduce((sum, t) => sum + t.attempt_total, 0);
    const totalSubmitted = tests.reduce((sum, t) => sum + t.attempt_submitted, 0);
    const avgScores = tests
        .filter((t) => t.avg_score !== null && t.max_score !== null && t.max_score > 0)
        .map((t) => ((t.avg_score! / t.max_score!) * 100));
    const overallAvg = avgScores.length > 0
        ? Math.round(avgScores.reduce((a, b) => a + b, 0) / avgScores.length)
        : null;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-purple-500 mr-2" />
                <span className="text-gray-500">Loading dashboard...</span>
            </div>
        );
    }

    if (tests.length === 0 && !error) {
        return (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                <ClipboardList size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-lg font-light text-gray-600 dark:text-gray-400">
                    No published tests yet
                </p>
                <p className="text-sm text-gray-500 mt-1">
                    Generate and publish an assessment above to start seeing candidate results here.
                </p>
            </div>
        );
    }

    const handleReviewUpdate = (updatedAttempt: Attempt) => {
        setSelectedAttempt(updatedAttempt);
    };

    // ─── Attempt Detail View ───────────────────────────────────────────
    if (view === "detail") {
        return (
            <AttemptDetailView
                attempt={selectedAttempt}
                testDetail={testDetail}
                loading={detailLoading}
                onBack={goBack}
                onReviewUpdate={handleReviewUpdate}
            />
        );
    }

    // ─── Attempts List View ────────────────────────────────────────────
    if (view === "attempts" && selectedTest) {
        return (
            <AttemptsListView
                test={selectedTest}
                attempts={attempts}
                loading={attemptsLoading}
                onBack={goBack}
                onViewDetail={openDetail}
                onCopyCode={copyCode}
                copied={copied}
            />
        );
    }

    // ─── Test List View (default) ──────────────────────────────────────
    return (
        <div>
            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                    {error}
                </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard icon={<ClipboardList size={18} />} label="Published Tests" value={tests.length} />
                <StatCard icon={<Users size={18} />} label="Total Candidates" value={totalCandidates} />
                <StatCard icon={<CheckCircle2 size={18} />} label="Submissions" value={totalSubmitted} />
                <StatCard
                    icon={<BarChart3 size={18} />}
                    label="Avg Score"
                    value={overallAvg !== null ? `${overallAvg}%` : "—"}
                />
            </div>

            {/* Search */}
            <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    placeholder="Search tests by title or code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm focus:outline-none focus:border-purple-400"
                />
            </div>

            {/* Test List */}
            <div className="space-y-3">
                {filteredTests.map((test) => {
                    const pct =
                        test.avg_score !== null && test.max_score && test.max_score > 0
                            ? Math.round((test.avg_score / test.max_score) * 100)
                            : null;

                    return (
                        <button
                            key={test.id}
                            onClick={() => openAttempts(test)}
                            className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-purple-400 dark:hover:border-purple-500 transition-colors group"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-medium text-black dark:text-white truncate">
                                            {test.title}
                                        </h4>
                                        <span className="flex-shrink-0 text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                            {test.test_code}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <FileText size={12} />
                                            {test.question_count} questions
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Users size={12} />
                                            {test.attempt_total} candidates
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <CheckCircle2 size={12} />
                                            {test.attempt_submitted} submitted
                                        </span>
                                        {test.attempt_in_progress > 0 && (
                                            <span className="flex items-center gap-1 text-amber-500">
                                                <Clock size={12} />
                                                {test.attempt_in_progress} in progress
                                            </span>
                                        )}
                                        {pct !== null && (
                                            <span className="flex items-center gap-1">
                                                <BarChart3 size={12} />
                                                Avg: {pct}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <ChevronRight
                                    size={18}
                                    className="text-gray-300 dark:text-gray-600 group-hover:text-purple-500 transition-colors flex-shrink-0 ml-3"
                                />
                            </div>
                        </button>
                    );
                })}
            </div>

            {filteredTests.length === 0 && searchQuery && (
                <div className="text-center py-8 text-sm text-gray-500">
                    No tests match "{searchQuery}"
                </div>
            )}
        </div>
    );
}


// ─── Sub-Components ──────────────────────────────────────────────────

function StatCard({
    icon,
    label,
    value,
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
}) {
    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
                {icon}
                <span className="text-xs uppercase">{label}</span>
            </div>
            <div className="text-2xl font-light text-black dark:text-white">{value}</div>
        </div>
    );
}


function AttemptsListView({
    test,
    attempts,
    loading,
    onBack,
    onViewDetail,
    onCopyCode,
    copied,
}: {
    test: TestSummary;
    attempts: Attempt[];
    loading: boolean;
    onBack: () => void;
    onViewDetail: (a: Attempt) => void;
    onCopyCode: (code: string) => void;
    copied: string | null;
}) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/recruiter-test/${test.test_code}`;

    const submitted = attempts.filter((a) => a.status === "submitted");
    const inProgress = attempts.filter((a) => a.status === "in_progress");

    return (
        <div>
            <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-black dark:hover:text-white mb-4 transition-colors"
            >
                <ArrowLeft size={16} />
                Back to tests
            </button>

            {/* Test Header */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-xl font-light text-black dark:text-white mb-1">
                            {test.title}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{test.question_count} questions</span>
                            <span>·</span>
                            <span>{attempts.length} candidates</span>
                            <span>·</span>
                            <span>
                                Created{" "}
                                {new Date(test.created_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                })}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <code className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono tracking-wider">
                            {test.test_code}
                        </code>
                        <button
                            onClick={() => onCopyCode(test.test_code)}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                            title="Copy test code"
                        >
                            {copied === test.test_code ? (
                                <Check size={14} className="text-green-500" />
                            ) : (
                                <Copy size={14} className="text-gray-400" />
                            )}
                        </button>
                    </div>
                </div>
                <div className="mt-2 text-xs text-gray-400 break-all">{link}</div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-purple-500 mr-2" />
                    <span className="text-gray-500 text-sm">Loading candidates...</span>
                </div>
            ) : attempts.length === 0 ? (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                    <Users size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                    <p className="text-gray-500">No candidates have attempted this test yet.</p>
                    <p className="text-xs text-gray-400 mt-1">
                        Share the test code or link with candidates.
                    </p>
                </div>
            ) : (
                <div>
                    {/* Submitted Attempts */}
                    {submitted.length > 0 && (
                        <div className="mb-6">
                            <h4 className="text-xs uppercase text-gray-500 mb-3 flex items-center gap-1">
                                <CheckCircle2 size={14} />
                                Submitted ({submitted.length})
                            </h4>
                            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 uppercase">
                                            <th className="text-left px-4 py-3 font-medium">Candidate</th>
                                            <th className="text-left px-4 py-3 font-medium">Email</th>
                                            <th className="text-center px-4 py-3 font-medium">MCQ Score</th>
                                            <th className="text-center px-4 py-3 font-medium">Percentage</th>
                                            <th className="text-left px-4 py-3 font-medium">Submitted</th>
                                            <th className="text-center px-4 py-3 font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {submitted.map((a) => {
                                            const pct =
                                                a.max_score && a.max_score > 0
                                                    ? Math.round(((a.score || 0) / a.max_score) * 100)
                                                    : null;
                                            return (
                                                <tr
                                                    key={a.id}
                                                    className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                                                >
                                                    <td className="px-4 py-3 font-medium text-black dark:text-white">
                                                        {a.candidate_name}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                                        {a.candidate_email}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="font-medium">
                                                            {a.score ?? 0}
                                                        </span>
                                                        <span className="text-gray-400">
                                                            /{a.max_score ?? 0}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {pct !== null ? (
                                                            <ScoreBadge pct={pct} />
                                                        ) : (
                                                            <span className="text-gray-400">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500 text-xs">
                                                        {a.submitted_at
                                                            ? new Date(a.submitted_at).toLocaleString("en-US", {
                                                                  month: "short",
                                                                  day: "numeric",
                                                                  hour: "2-digit",
                                                                  minute: "2-digit",
                                                              })
                                                            : "—"}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <button
                                                            onClick={() => onViewDetail(a)}
                                                            className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full border border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                                                        >
                                                            <Eye size={12} />
                                                            View Answers
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* In-progress Attempts */}
                    {inProgress.length > 0 && (
                        <div>
                            <h4 className="text-xs uppercase text-gray-500 mb-3 flex items-center gap-1">
                                <Clock size={14} className="text-amber-500" />
                                In Progress ({inProgress.length})
                            </h4>
                            <div className="space-y-2">
                                {inProgress.map((a) => (
                                    <div
                                        key={a.id}
                                        className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3"
                                    >
                                        <div>
                                            <span className="font-medium text-sm text-black dark:text-white">
                                                {a.candidate_name}
                                            </span>
                                            <span className="ml-2 text-xs text-gray-500">
                                                {a.candidate_email}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-amber-500">
                                            <Clock size={12} />
                                            Started{" "}
                                            {new Date(a.started_at).toLocaleString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


function AttemptDetailView({
    attempt,
    testDetail,
    loading,
    onBack,
    onReviewUpdate,
}: {
    attempt: Attempt | null;
    testDetail: TestDetail | null;
    loading: boolean;
    onBack: () => void;
    onReviewUpdate: (updated: Attempt) => void;
}) {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
    const [reviewingIdx, setReviewingIdx] = useState<number | null>(null);
    const [reviewError, setReviewError] = useState<string | null>(null);

    const submitReview = async (
        questionIndex: number,
        verdict: "approved" | "rejected",
        feedback: string | null
    ) => {
        if (!attempt || !testDetail) return;
        setReviewingIdx(questionIndex);
        setReviewError(null);
        try {
            const res = await fetch(
                `${backend}/recruiter/tests/${attempt.test_id}/attempts/${attempt.id}/review`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        reviews: [
                            {
                                question_index: questionIndex,
                                verdict,
                                feedback: feedback || null,
                            },
                        ],
                    }),
                }
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.detail || `Review failed (${res.status})`);
            }
            const data = await res.json();
            onReviewUpdate(data.attempt);
        } catch (e: any) {
            setReviewError(e?.message || "Review failed");
        } finally {
            setReviewingIdx(null);
        }
    };

    if (loading || !attempt || !testDetail) {
        return (
            <div>
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-black dark:hover:text-white mb-4 transition-colors"
                >
                    <ArrowLeft size={16} />
                    Back to candidates
                </button>
                <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-purple-500 mr-2" />
                    <span className="text-gray-500 text-sm">Loading details...</span>
                </div>
            </div>
        );
    }

    const pct =
        attempt.max_score && attempt.max_score > 0
            ? Math.round(((attempt.score || 0) / attempt.max_score) * 100)
            : null;

    const questions = testDetail.questions || [];
    const answers = attempt.answers || [];
    const answerMap: Record<number, any> = {};
    for (const a of answers) {
        if (a.question_index !== undefined) {
            answerMap[a.question_index] = a;
        }
    }

    const mcqCount = questions.filter((q) => q.type === "mcq").length;
    const codeCount = questions.filter((q) => q.type === "code").length;
    const textCount = questions.filter((q) => q.type === "text").length;

    const reviewableQuestions = questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => q.type !== "mcq");
    const reviewedCount = reviewableQuestions.filter(
        ({ i }) => answerMap[i]?.review_verdict
    ).length;
    const approvedCount = reviewableQuestions.filter(
        ({ i }) => answerMap[i]?.review_verdict === "approved"
    ).length;
    const rejectedCount = reviewableQuestions.filter(
        ({ i }) => answerMap[i]?.review_verdict === "rejected"
    ).length;

    return (
        <div>
            <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-black dark:hover:text-white mb-4 transition-colors"
            >
                <ArrowLeft size={16} />
                Back to candidates
            </button>

            {/* Candidate Header */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-xl font-light text-black dark:text-white">
                            {attempt.candidate_name}
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">{attempt.candidate_email}</p>
                        <p className="text-xs text-gray-400 mt-1">
                            Test: {testDetail.title} · {testDetail.test_code}
                        </p>
                    </div>
                    <div className="text-right">
                        {attempt.status === "submitted" ? (
                            <>
                                <div className="text-3xl font-light text-black dark:text-white">
                                    {attempt.score ?? 0}
                                    <span className="text-lg text-gray-400">
                                        /{attempt.max_score ?? 0}
                                    </span>
                                </div>
                                {pct !== null && (
                                    <div className="mt-1">
                                        <ScoreBadge pct={pct} large />
                                    </div>
                                )}
                                <p className="text-[10px] text-gray-400 mt-1">MCQ auto-scored</p>
                            </>
                        ) : (
                            <span className="text-xs text-amber-500 flex items-center gap-1">
                                <Clock size={12} />
                                In Progress
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-gray-500">
                    <span>Started: {new Date(attempt.started_at).toLocaleString()}</span>
                    {attempt.submitted_at && (
                        <span>Submitted: {new Date(attempt.submitted_at).toLocaleString()}</span>
                    )}
                </div>
                <div className="flex gap-3 mt-3 flex-wrap">
                    {mcqCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                            {mcqCount} MCQ
                        </span>
                    )}
                    {codeCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800">
                            {codeCount} Code
                        </span>
                    )}
                    {textCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                            {textCount} Text
                        </span>
                    )}
                </div>

                {/* Review progress bar */}
                {reviewableQuestions.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                            <span>Manual Review Progress</span>
                            <span>
                                {reviewedCount}/{reviewableQuestions.length} reviewed
                                {approvedCount > 0 && (
                                    <span className="text-green-600 dark:text-green-400 ml-2">
                                        {approvedCount} approved
                                    </span>
                                )}
                                {rejectedCount > 0 && (
                                    <span className="text-red-500 ml-2">
                                        {rejectedCount} rejected
                                    </span>
                                )}
                            </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                            {approvedCount > 0 && (
                                <div
                                    className="h-full bg-green-500 transition-all"
                                    style={{
                                        width: `${(approvedCount / reviewableQuestions.length) * 100}%`,
                                    }}
                                />
                            )}
                            {rejectedCount > 0 && (
                                <div
                                    className="h-full bg-red-500 transition-all"
                                    style={{
                                        width: `${(rejectedCount / reviewableQuestions.length) * 100}%`,
                                    }}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>

            {reviewError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                    {reviewError}
                </div>
            )}

            {/* Question-by-Question Review */}
            <div className="space-y-4">
                {questions.map((q, idx) => {
                    const ans = answerMap[idx];
                    return (
                        <QuestionReviewCard
                            key={idx}
                            index={idx}
                            question={q}
                            answer={ans}
                            onReview={submitReview}
                            isReviewing={reviewingIdx === idx}
                        />
                    );
                })}
            </div>
        </div>
    );
}


function QuestionReviewCard({
    index,
    question,
    answer,
    onReview,
    isReviewing,
}: {
    index: number;
    question: TestQuestion;
    answer: any;
    onReview: (idx: number, verdict: "approved" | "rejected", feedback: string | null) => void;
    isReviewing: boolean;
}) {
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackText, setFeedbackText] = useState(answer?.review_feedback || "");
    const [pendingVerdict, setPendingVerdict] = useState<"approved" | "rejected" | null>(null);

    const isCorrectMCQ =
        question.type === "mcq" &&
        answer?.mcq_selected_index !== null &&
        answer?.mcq_selected_index !== undefined &&
        answer.mcq_selected_index === question.correct_index;
    const isWrongMCQ =
        question.type === "mcq" &&
        answer?.mcq_selected_index !== null &&
        answer?.mcq_selected_index !== undefined &&
        answer.mcq_selected_index !== question.correct_index;
    const noAnswer =
        !answer ||
        (question.type === "mcq" && (answer.mcq_selected_index === null || answer.mcq_selected_index === undefined)) ||
        (question.type === "code" && !answer.code_answer) ||
        (question.type === "text" && !answer.text_answer);

    const isManualReview = question.type !== "mcq" && !noAnswer;
    const reviewVerdict: string | null = answer?.review_verdict || null;
    const reviewFeedback: string | null = answer?.review_feedback || null;

    const borderColor = isCorrectMCQ
        ? "border-green-300 dark:border-green-700"
        : isWrongMCQ
        ? "border-red-300 dark:border-red-700"
        : reviewVerdict === "approved"
        ? "border-green-300 dark:border-green-700"
        : reviewVerdict === "rejected"
        ? "border-red-300 dark:border-red-700"
        : "border-gray-200 dark:border-gray-700";

    const handleQuickReview = (verdict: "approved" | "rejected") => {
        setPendingVerdict(verdict);
        setShowFeedback(true);
    };

    const submitWithFeedback = () => {
        if (!pendingVerdict) return;
        onReview(index, pendingVerdict, feedbackText.trim() || null);
        setShowFeedback(false);
        setPendingVerdict(null);
    };

    const submitWithoutFeedback = (verdict: "approved" | "rejected") => {
        onReview(index, verdict, null);
    };

    return (
        <div className={`rounded-xl border ${borderColor} p-4`}>
            {/* Question Header */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[11px] font-medium text-gray-500">Q{index + 1}</span>
                <TypeBadge type={question.type} />
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                    {question.skill}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                    {question.difficulty}
                </span>
                {/* Result indicator */}
                <div className="ml-auto">
                    {isCorrectMCQ && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <CheckCircle2 size={14} />
                            Correct
                        </span>
                    )}
                    {isWrongMCQ && (
                        <span className="flex items-center gap-1 text-xs text-red-500">
                            <XCircle size={14} />
                            Incorrect
                        </span>
                    )}
                    {noAnswer && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                            <AlertCircle size={14} />
                            No answer
                        </span>
                    )}
                    {isManualReview && !reviewVerdict && (
                        <span className="flex items-center gap-1 text-xs text-amber-500">
                            <Eye size={14} />
                            Pending review
                        </span>
                    )}
                    {reviewVerdict === "approved" && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <ThumbsUp size={14} />
                            Approved
                        </span>
                    )}
                    {reviewVerdict === "rejected" && (
                        <span className="flex items-center gap-1 text-xs text-red-500">
                            <ThumbsDown size={14} />
                            Rejected
                        </span>
                    )}
                </div>
            </div>

            {/* Question Text */}
            <div className="text-sm mb-3 whitespace-pre-wrap text-black dark:text-white">
                {question.question}
            </div>

            {/* MCQ Options */}
            {question.type === "mcq" && question.options && (
                <div className="space-y-1.5 mb-3">
                    {question.options.map((opt, oi) => {
                        const isSelected = answer?.mcq_selected_index === oi;
                        const isCorrect = question.correct_index === oi;
                        let optClass = "text-gray-600 dark:text-gray-400";
                        if (isCorrect) optClass = "text-green-600 dark:text-green-400 font-medium";
                        if (isSelected && !isCorrect) optClass = "text-red-500 font-medium";

                        return (
                            <div key={oi} className={`flex items-start gap-2 text-sm ${optClass}`}>
                                <span className="flex-shrink-0 w-5">
                                    {String.fromCharCode(65 + oi)}.
                                </span>
                                <span className="flex-1">{opt}</span>
                                {isCorrect && (
                                    <CheckCircle2 size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                                )}
                                {isSelected && !isCorrect && (
                                    <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Code Answer */}
            {question.type === "code" && (
                <div className="space-y-2">
                    {question.language && (
                        <div className="text-[10px] text-gray-500">Language: {question.language}</div>
                    )}
                    {answer?.code_answer ? (
                        <div>
                            <div className="text-[10px] uppercase text-gray-500 mb-1">
                                Candidate&apos;s Code
                            </div>
                            <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto border border-gray-100 dark:border-gray-800 whitespace-pre-wrap">
                                {answer.code_answer}
                            </pre>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">No code submitted</p>
                    )}
                    {question.expected_solution && (
                        <details className="text-xs">
                            <summary className="cursor-pointer text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                                Reference solution
                            </summary>
                            <pre className="mt-1 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg overflow-x-auto border border-green-100 dark:border-green-800 whitespace-pre-wrap">
                                {question.expected_solution}
                            </pre>
                        </details>
                    )}
                </div>
            )}

            {/* Text Answer */}
            {question.type === "text" && (
                <div className="space-y-2">
                    {answer?.text_answer ? (
                        <div>
                            <div className="text-[10px] uppercase text-gray-500 mb-1">
                                Candidate&apos;s Answer
                            </div>
                            <div className="text-sm bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-800 whitespace-pre-wrap">
                                {answer.text_answer}
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">No answer submitted</p>
                    )}
                    {question.expected_answer && (
                        <details className="text-xs">
                            <summary className="cursor-pointer text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                                Expected answer
                            </summary>
                            <div className="mt-1 text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100 dark:border-green-800 whitespace-pre-wrap">
                                {question.expected_answer}
                            </div>
                        </details>
                    )}
                </div>
            )}

            {/* Rationale (for any type) */}
            {question.rationale && (
                <details className="text-xs mt-2">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        Rationale
                    </summary>
                    <div className="mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                        {question.rationale}
                    </div>
                </details>
            )}

            {/* Existing review feedback display */}
            {reviewFeedback && (
                <div className="mt-3 flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                    <MessageSquare size={12} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <div className="text-[10px] uppercase text-gray-400 mb-0.5">Review Feedback</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                            {reviewFeedback}
                        </div>
                    </div>
                </div>
            )}

            {/* Review Actions — only for code/text questions with answers */}
            {isManualReview && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    {isReviewing ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Loader2 size={14} className="animate-spin" />
                            Saving review...
                        </div>
                    ) : showFeedback ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs">
                                <span className={`flex items-center gap-1 font-medium ${
                                    pendingVerdict === "approved"
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-red-500"
                                }`}>
                                    {pendingVerdict === "approved" ? (
                                        <><ThumbsUp size={12} /> Approving</>
                                    ) : (
                                        <><ThumbsDown size={12} /> Rejecting</>
                                    )}
                                </span>
                                <span className="text-gray-400">— add feedback (optional)</span>
                            </div>
                            <textarea
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                                placeholder="e.g. Good approach but missing edge case handling..."
                                rows={2}
                                className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent p-2 focus:outline-none focus:border-purple-400"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={submitWithFeedback}
                                    className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-purple-600 text-white hover:opacity-90 transition-opacity"
                                >
                                    <Send size={10} />
                                    Submit Review
                                </button>
                                <button
                                    onClick={() => {
                                        setShowFeedback(false);
                                        setPendingVerdict(null);
                                        setFeedbackText(answer?.review_feedback || "");
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-black dark:hover:text-white transition-colors"
                                >
                                    <X size={10} />
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleQuickReview("approved")}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors ${
                                    reviewVerdict === "approved"
                                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700"
                                        : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-green-400 hover:text-green-600 dark:hover:text-green-400"
                                }`}
                            >
                                <ThumbsUp size={12} />
                                {reviewVerdict === "approved" ? "Approved" : "Approve"}
                            </button>
                            <button
                                onClick={() => handleQuickReview("rejected")}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors ${
                                    reviewVerdict === "rejected"
                                        ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700"
                                        : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-red-400 hover:text-red-500"
                                }`}
                            >
                                <ThumbsDown size={12} />
                                {reviewVerdict === "rejected" ? "Rejected" : "Reject"}
                            </button>
                            {reviewVerdict && (
                                <button
                                    onClick={() => handleQuickReview(reviewVerdict as "approved" | "rejected")}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                >
                                    <MessageSquare size={10} />
                                    {reviewFeedback ? "Edit feedback" : "Add feedback"}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


function ScoreBadge({ pct, large }: { pct: number; large?: boolean }) {
    const color =
        pct >= 70
            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
            : pct >= 40
            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
            : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full font-medium ${color} ${
                large ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"
            }`}
        >
            <Trophy size={large ? 14 : 10} />
            {pct}%
        </span>
    );
}


function TypeBadge({ type }: { type: string }) {
    const config: Record<string, { icon: React.ReactNode; class: string }> = {
        mcq: {
            icon: <ClipboardList size={10} />,
            class: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
        },
        code: {
            icon: <Code size={10} />,
            class: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
        },
        text: {
            icon: <FileText size={10} />,
            class: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
        },
    };
    const c = config[type] || config.text;

    return (
        <span
            className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded uppercase ${c.class}`}
        >
            {c.icon}
            {type}
        </span>
    );
}
