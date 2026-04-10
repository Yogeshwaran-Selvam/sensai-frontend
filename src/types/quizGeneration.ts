export type QuizPurpose = 'practice' | 'exam';
export type QuizDifficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'objective' | 'subjective';
export type ObjectiveAnswerType = 'mcq' | 'fill_in_the_blanks';
export type SubjectiveAnswerType = 'short_answer' | 'long_answer' | 'code';
export type AnswerType = ObjectiveAnswerType | SubjectiveAnswerType;
export type TopicTier = 'major' | 'minor' | 'custom';

export const QUIZ_LENGTHS = [10, 15, 20] as const;
export type QuizLength = (typeof QUIZ_LENGTHS)[number];

export interface TopicWeight {
    keyword: string;
    weight: number; // 0–100, all topics always sum to 100
    tier: TopicTier;
}

// Pre-defined minor topics shown as addable chips
export const ADDABLE_MINOR_TOPICS = ['Dynamic Programming', 'Two Pointers'] as const;

// Default major topics always loaded
export const DEFAULT_MAJOR_TOPICS = ['Data Structures', 'Algorithms', 'Recursion'] as const;

export interface QuizGenerationPayload {
    course_title: string;
    module_title: string;
    purpose: QuizPurpose;
    length: QuizLength;
    difficulty: QuizDifficulty;
    question_type: QuestionType;
    answer_type: AnswerType;
    topic_weights: { keyword: string; weight: number }[];
    course_id: number;
    org_id: number;
}

export interface BloomsDistribution {
    remember: number;
    understand: number;
    apply: number;
    analyze: number;
    evaluate: number;
    create: number;
}

export const DEFAULT_BLOOMS_DISTRIBUTION: BloomsDistribution = {
    remember: 20,
    understand: 20,
    apply: 20,
    analyze: 20,
    evaluate: 10,
    create: 10,
};

export const BLOOMS_LEVELS: { key: keyof BloomsDistribution; label: string; color: string }[] = [
    { key: 'remember',   label: 'Remember',   color: '#60a5fa' },
    { key: 'understand', label: 'Understand',  color: '#34d399' },
    { key: 'apply',      label: 'Apply',       color: '#fbbf24' },
    { key: 'analyze',    label: 'Analyze',     color: '#f97316' },
    { key: 'evaluate',   label: 'Evaluate',    color: '#a78bfa' },
    { key: 'create',     label: 'Create',      color: '#f472b6' },
];

export type VerificationStatus = 'verified' | 'pending' | 'wrong';

export interface GeneratedQuestion {
    id: string;
    question_text: string;
    topic: string;
    blooms_level: string;
    options: string[] | null;
    correct_answer: string;
    explanation: string;
    difficulty: string;
    question_type: string;
    verification_status: VerificationStatus;
    verification_reason: string;
}
