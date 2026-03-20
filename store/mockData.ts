
/**
 * @deprecated These mock data constants are for development only.
 * Please use DataService methods to fetch real data from Supabase:
 * - getTeacherClasses(teacherId)
 * - getClassStudents(classId)
 * - getTeacherStudents(teacherId)
 * - findClassByCode(code)
 * - getStudentClasses(studentId)
 */

export const MOCK_SCHOOLS = [
  { id: 'sch1', name: 'Springfield Elementary', logo: '🏫', ownerId: 'u1' },
  { id: 'sch2', name: 'Global Online Academy', logo: '🌍', ownerId: 'u2' }
];

export const MOCK_USERS = [
  { id: 'u1', role: 'district_admin', name: 'Principal Skinner', email: 'admin@springfield.edu', schoolId: 'sch1' },
  { id: 'u2', role: 'teacher', name: 'Mrs. Krabappel', email: 'edna@springfield.edu', schoolId: 'sch1' }
];

export const MOCK_STUDENTS = [
  { id: 's1', name: 'Leo', avatar: '🦁', points: 120, level: 5, team: 'red', schoolId: 'sch1', classId: 'c1' },
  { id: 's2', name: 'Sarah', avatar: '🦄', points: 145, level: 6, team: 'blue', schoolId: 'sch1', classId: 'c1' },
  { id: 's3', name: 'Mike', avatar: '🤖', points: 90, level: 4, team: 'red', schoolId: 'sch1', classId: 'c1' },
  { id: 's4', name: 'Emma', avatar: '🦊', points: 110, level: 5, team: 'blue', schoolId: 'sch1', classId: 'c1' },
  { id: 's5', name: 'Jay', avatar: '🐼', points: 130, level: 6, team: 'red', schoolId: 'sch1', classId: 'c1' },
  { id: 's6', name: 'Zoe', avatar: '🐨', points: 125, level: 5, team: 'blue', schoolId: 'sch1', classId: 'c1' },
];

export const MOCK_UNITS = [
  { id: 'u1', title: 'Unit 1: Jungle Safari', status: 'Active', lessons: 4, level: 'Beginner' },
  { id: 'u2', title: 'Unit 2: My Family', status: 'Draft', lessons: 3, level: 'Beginner' },
  { id: 'u3', title: 'Unit 3: Space Travel', status: 'Locked', lessons: 5, level: 'Intermediate' },
];

export const MOCK_LESSON_FLOW = [
  {
    id: 'step_select',
    type: 'UNIT_SELECTION',
    title: 'Lobby',
    duration: 0,
    teacherGuide: {
      instruction: "Wait for students to arrive. Ensure the projector is focused.",
      script: "Good morning class! Please take your seats.",
      tips: ["Check audio levels", "Verify internet connection"]
    },
    data: {}
  },
  {
    id: 'step_1',
    type: 'INTRO_SPLASH',
    title: 'Welcome Class 3B',
    duration: 5,
    teacherGuide: {
      instruction: "Announce the winning team from yesterday. Set the tone for the jungle theme.",
      script: "Welcome back! Today we are going on a Safari. Let's see which team is leading.",
      tips: ["Highlight the score difference to motivate the trailing team."]
    },
    data: { theme: 'Jungle Safari' }
  },
  {
    id: 'step_poll',
    type: 'POLL',
    title: 'Class Vote',
    duration: 120,
    teacherGuide: {
      instruction: "Ask students to vote using their hand signals or devices.",
      script: "Which of these animals is the King of the Jungle?",
      answerKey: "Opinion based."
    },
    data: {
      question: "Which animal is the King of the Jungle?",
      options: [
        { id: 'A', text: 'Lion 🦁', color: 'bg-yellow-500', ring: 'ring-yellow-500' },
        { id: 'B', text: 'Elephant 🐘', color: 'bg-blue-500', ring: 'ring-blue-500' },
        { id: 'C', text: 'Tiger 🐯', color: 'bg-orange-500', ring: 'ring-orange-500' },
        { id: 'D', text: 'Gorilla 🦍', color: 'bg-stone-500', ring: 'ring-stone-500' }
      ]
    }
  },
  {
    id: 'step_warmup',
    type: 'LIVE_WARMUP',
    title: 'Warm-Up Song',
    duration: 300,
    teacherGuide: {
      instruction: "Play the video. Encourage students to stand up and dance along.",
      script: "Let's warm up! Stand up and copy the moves!",
      tips: ["Use the 'Quiet' button if they get too loud after the song."]
    },
    data: {
      videoThumbnail: 'https://img.freepik.com/free-vector/jungle-landscape-background_1308-49033.jpg',
      vocab: [
        { icon: '🦁', text: 'Lion' },
        { icon: '🌴', text: 'Tree' },
        { icon: '🐍', text: 'Snake' },
        { icon: '🚙', text: 'Jeep' }
      ]
    }
  },
  {
    id: 'step_3',
    type: 'FOCUS_CARDS',
    title: 'New Vocabulary',
    duration: 300,
    teacherGuide: {
      instruction: "Introduce each word. Model the pronunciation 3 times.",
      script: "Repeat after me: Elephant. El-e-phant.",
      answerKey: "1. Elephant, 2. Giraffe, 3. Lion"
    },
    data: {
      title: "Jungle Animals",
      cards: [
        { id: 'c1', front: '🐘', back: 'Elephant', pronunciation: '/ˈel.ɪ.fənt/' },
        { id: 'c2', front: '🦒', back: 'Giraffe', pronunciation: '/dʒɪˈrɑːf/' },
        { id: 'c3', front: '🦁', back: 'Lion', pronunciation: '/ˈlaɪ.ən/' },
      ]
    }
  },
  {
    id: 'step_6',
    type: 'GRAMMAR_SANDBOX',
    title: 'Grammar: Nouns & Verbs',
    duration: 400,
    teacherGuide: {
      instruction: "Drag the words to the correct spots in the scene.",
      script: "Is 'Running' a person, a place, or an action?",
      answerKey: "Dog (Noun), Running (Verb), Bench (Noun), Tree (Noun)"
    },
    data: {
      topic: 'Nouns & Verbs',
      background: 'park', // 'park' triggers the internal park layout config in the component
      items: [
        { id: 'w1', text: 'Running', type: 'verb', targetId: 'zone-boy' },
        { id: 'w2', text: 'Dog', type: 'noun', targetId: 'zone-dog' },
        { id: 'w3', text: 'Bench', type: 'noun', targetId: 'zone-bench' },
        { id: 'w4', text: 'Tree', type: 'noun', targetId: 'zone-tree' }
      ]
    }
  },
  {
    id: 'step_10',
    type: 'TEAM_BATTLE',
    title: 'Territory Battle',
    duration: 600,
    teacherGuide: {
      instruction: "Teams answer Past Simple questions to claim territory.",
      script: "Red team, read the sentence. What is the past tense of 'climb'?",
      answerKey: "Q1: roared, Q2: climbed, Q3: saw"
    },
    data: {
      topic: 'Past Simple Verbs',
      questions: [
        {
          id: 'q1',
          image: "https://img.freepik.com/free-vector/lion-roaring-white-background_1308-38706.jpg",
          text: "The lion ____ loudly last night.",
          options: ["roar", "roared", "roaring", "roars"],
          correct: "roared"
        },
        {
          id: 'q2',
          image: "https://img.freepik.com/free-vector/cute-monkey-hanging-tree-cartoon-vector-icon-illustration_138676-2226.jpg",
          text: "The monkey ____ up the tree.",
          options: ["climb", "climbed", "climbing", "climbs"],
          correct: "climbed"
        },
        {
          id: 'q3',
          image: "https://img.freepik.com/free-vector/safari-travel-concept_23-2148599427.jpg",
          text: "We ____ a big snake on the road.",
          options: ["see", "saw", "seen", "seeing"],
          correct: "saw"
        }
      ]
    }
  },
  {
    id: 'step_11',
    type: 'STORY_STAGE',
    title: 'Story: The Lost Hat',
    duration: 600,
    teacherGuide: {
      instruction: "Read the story aloud first. Then ask students to roleplay Rocky.",
      script: "Look at Rocky. How does he feel? Why is he sad?",
      answerKey: "Hat is on the monkey."
    },
    data: {
      pages: [
        { id: 'p1', image: 'panel1', text: "Oh no! Where is my hat?" },
        { id: 'p2', image: 'panel2', text: "Is it on the monkey?" },
      ]
    }
  }
];
