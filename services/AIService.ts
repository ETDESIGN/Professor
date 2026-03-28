/**
 * AI Service for automated curriculum generation.
 * Currently simulates API responses until a real LLM is integrated.
 */

export interface GeneratedFlashcard {
    question: string;
    answer: string;
}

export interface GeneratedLesson {
    title: string;
    description: string;
    flashcards: GeneratedFlashcard[];
}

export const AIService = {
    /**
     * Simulates generating a lesson based on topic and grade level.
     */
    async generateLessonContent(topic: string, gradeLevel: string): Promise<GeneratedLesson> {
        console.log(`Generating AI Lesson for ${gradeLevel} on ${topic}...`);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        return {
            title: `${topic} Masterclass`,
            description: `A comprehensive, AI-generated lesson focused on ${topic} designed specifically for ${gradeLevel} students.`,
            flashcards: [
                {
                    question: `What is the core concept of ${topic}?`,
                    answer: `The core concept involves understanding the fundamental principles of ${topic} appropriate for ${gradeLevel}.`
                },
                {
                    question: `Can you give an example of ${topic} in real life?`,
                    answer: `Yes, an everyday example of ${topic} is how it applies to daily problem solving at a ${gradeLevel} level.`
                },
                {
                    question: `Why is ${topic} important to learn?`,
                    answer: `Learning ${topic} builds critical thinking and is foundational for advanced studies in similar subjects.`
                }
            ]
        };
    }
};
