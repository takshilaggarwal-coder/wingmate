// Shared data model. Everything an agent knows comes from exactly two sources:
// the person's public LinkedIn and their public Instagram.

export type SourceName = "linkedin" | "instagram";
export type TraitSource = SourceName | "both";

export interface LinkedInExperience {
  title?: string;
  company?: string;
  duration?: string;
  location?: string;
  description?: string;
}

export interface LinkedInEducation {
  school?: string;
  degree?: string;
  field?: string;
  years?: string;
}

export interface LinkedInPost {
  ref: string; // "li-post-1"
  text: string;
  date?: string;
  likes?: number;
  comments?: number;
}

export interface RawLinkedIn {
  url: string;
  publicIdentifier?: string;
  name: string;
  headline?: string;
  about?: string;
  location?: string;
  followers?: number;
  connections?: number;
  photoUrl?: string;
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  skills: string[];
  languages: string[];
  certifications: string[];
  volunteering: string[];
  posts: LinkedInPost[];
}

export interface InstagramPost {
  ref: string; // "ig-post-1"
  type?: string;
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  likes?: number;
  comments?: number;
  timestamp?: string;
  imageUrl?: string; // original CDN url (expires)
  image?: string; // local/stable thumbnail (path or data URL)
  location?: string;
  alt?: string;
  url?: string;
}

export interface RawInstagram {
  url: string;
  username: string;
  fullName?: string;
  bio?: string;
  followers?: number;
  following?: number;
  postsCount?: number;
  verified?: boolean;
  isPrivate?: boolean;
  category?: string;
  externalUrl?: string;
  profilePicUrl?: string;
  posts: InstagramPost[];
}

export interface RawSources {
  linkedin: RawLinkedIn;
  instagram: RawInstagram;
  scrapedAt: string;
}

export interface Trait {
  label: string;
  detail: string;
  source: TraitSource;
  evidence: string;
}

export interface ReadingNote {
  source: SourceName;
  ref: string; // which item was read, e.g. "li-about", "li-exp-2", "ig-post-4", "ig-bio"
  text: string;
}

export interface BigFive {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface Analysis {
  oneLiner: string;
  summary: string;
  pronouns: string;
  location: string;
  needs: Trait[];
  hobbies: Trait[];
  interests: Trait[];
  values: Trait[];
  personality: {
    traits: Trait[];
    communicationStyle: string;
    humor: string;
    socialEnergy: "introvert" | "ambivert" | "extrovert";
    bigFive: BigFive;
  };
  lifestyle: {
    pace: string;
    schedule: string;
    travel: string;
    fitness: string;
    social: string;
  };
  careerDrive: string;
  loveLanguage: { primary: string; why: string };
  idealPartner: string;
  greenFlags: string[];
  dealbreakers: string[];
  dateIdeas: string[];
  conversationStarters: string[];
  agentBrief: {
    voice: string;
    sellingPoints: string[];
    agenda: string[];
    mustAsk: string[];
  };
  tags: string[];
  confidence: { overall: number; gaps: string[] };
}

export type InterestedIn = "anyone" | "women" | "men";

export interface Person {
  id: string;
  name: string;
  firstName: string;
  linkedinUrl: string;
  instagramUrl: string;
  avatar?: string;
  interestedIn: InterestedIn;
  origin: "season" | "local";
  createdAt: string;
  notes: ReadingNote[];
  analysis: Analysis;
  // Raw sources. For season people this is loaded lazily from /season/raw/{id}.json.
  raw?: RawSources;
  stats?: {
    linkedinFollowers?: number;
    instagramFollowers?: number;
    linkedinPosts: number;
    instagramPosts: number;
    experiences: number;
  };
}

/** What an agent is allowed to know about the *other* person before meeting: a dating-app style card. */
export interface PublicCard {
  id: string;
  name: string;
  firstName: string;
  pronouns: string;
  oneLiner: string;
  location: string;
  tags: string[];
}

/** What gets sent to the server to run an agent: its own person's private dossier. */
export interface AgentInput {
  id: string;
  name: string;
  firstName: string;
  analysis: Analysis;
}

export interface ChatLine {
  speaker: string; // person id or "director"
  text: string;
  thought?: string; // private, never shown to the other agent
  signal?: number; // -2..2 how this moment felt for the speaker's person
  scene?: number;
}

export interface SpeedRating {
  score: number; // 1-10
  note: string;
  highlight: string;
  wantsDate: boolean;
}

export interface SpeedDate {
  id: string;
  a: string;
  b: string;
  lines: ChatLine[];
  ratings: Record<string, SpeedRating>;
  createdAt: string;
}

export interface Invitation {
  id: string;
  from: string;
  to: string;
  message: string;
  venue: string;
  activity: string;
  why: string;
  accepted: boolean;
  reply: string;
  createdAt: string;
}

export interface DateScene {
  title: string;
  setting: string;
  twist: string;
}

export interface DimensionScore {
  score: number; // 1-10
  note: string;
}

export interface Debrief {
  overall: number; // 0-100
  verdict: "second date" | "maybe" | "pass";
  headline: string;
  dimensions: {
    values: DimensionScore;
    lifestyle: DimensionScore;
    ambition: DimensionScore;
    communication: DimensionScore;
    interests: DimensionScore;
    chemistry: DimensionScore;
  };
  greenFlags: string[];
  concerns: string[];
  bestMoment: string;
  toMyHuman: string;
}

export interface FullDate {
  id: string;
  a: string; // asked
  b: string; // accepted
  title: string;
  venue: string;
  activity: string;
  scenes: DateScene[];
  lines: ChatLine[];
  debriefs: Record<string, Debrief>;
  mutual: boolean;
  createdAt: string;
}

export interface Season {
  generatedAt: string;
  model: string;
  people: Person[];
  speedDates: SpeedDate[];
  invitations: Invitation[];
  dates: FullDate[];
}

export interface RankingEntry {
  personId: string;
  otherId: string;
  score: number; // 0-100
  myView: number | null; // my agent's view of them (0-100)
  theirView: number | null; // their agent's view of me (0-100)
  prior: number; // matchmaker forecast (0-100)
  basis: "date" | "speed" | "forecast";
  mutual: boolean;
  reason: string;
  dateId?: string;
  speedId?: string;
}

// Streaming events from the API routes (NDJSON).
export type DateEvent =
  | { type: "status"; message: string }
  | { type: "scene"; index: number; scene: DateScene }
  | { type: "plan"; title: string; venue: string; activity: string; scenes: DateScene[] }
  | { type: "line"; line: ChatLine }
  | { type: "rating"; personId: string; rating: SpeedRating }
  | { type: "debrief"; personId: string; debrief: Debrief }
  | { type: "speed-done"; speedDate: SpeedDate }
  | { type: "date-done"; date: FullDate }
  | { type: "error"; message: string };

export type AnalyzeEvent =
  | { type: "status"; message: string }
  | { type: "note"; note: ReadingNote }
  | { type: "analysis"; analysis: Analysis }
  | { type: "error"; message: string };
