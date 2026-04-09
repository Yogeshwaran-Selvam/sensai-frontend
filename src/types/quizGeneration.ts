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
