// Fixed tag vocabulary so the matchmaker can compare people consistently.
export const TAGS = [
  "ai", "tech", "startups", "investing", "finance", "real-estate", "marketing", "sales", "leadership", "management",
  "entrepreneurship", "small-business", "creator-economy", "media", "podcasts", "writing", "books", "journalism", "public-speaking", "teaching",
  "science", "psychology", "behavioral-science", "relationships", "mental-health", "wellness", "meditation", "spirituality", "faith", "philosophy",
  "fitness", "running", "gym", "yoga", "sports", "football", "basketball", "cricket", "tennis", "golf",
  "outdoors", "hiking", "surfing", "skiing", "nature", "travel", "adventure", "food", "cooking", "coffee",
  "wine", "nightlife", "fashion", "beauty", "design", "art", "photography", "film", "music", "dance",
  "comedy", "gaming", "cars", "architecture", "family", "parenting", "pets", "dogs", "philanthropy", "social-impact",
  "education", "womens-empowerment", "diversity", "productivity", "self-improvement", "personal-finance", "health", "nutrition", "culture", "languages",
  "india", "london", "new-york", "los-angeles", "silicon-valley", "europe", "community", "events", "luxury", "minimalism",
] as const;

export type Tag = (typeof TAGS)[number];
