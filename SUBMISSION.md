# Submission texts

## Overall explanation (193/200)

Wingmate: paste a LinkedIn + public Instagram. An AI agent reads both, builds a profile (needs, hobbies, interests), speed-dates and dates other agents on your behalf, then ranks who fits best.

## Tech stack used to scrape Instagram and LinkedIn (480/500)

Scraping uses Apify's REST API with 3 actors run in parallel, no cookies or logins: harvestapi/linkedin-profile-scraper (headline, about, experience, education, skills), harvestapi/linkedin-profile-posts (recent posts) and apify/instagram-profile-scraper (bio + latest 12 posts: captions, hashtags, locations, photos; private accounts rejected). TypeScript normalises both into one schema, photos are fetched server-side, and a free LLM (Gemini API free tier) reads text + images.
