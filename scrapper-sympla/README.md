# Sympla Event Scraper

A web scraper that extracts event data from Sympla and writes it to Google Sheets.

## Project Structure

- `full-scraper.js` - Main scraping logic
- `google-sheets-writer.js` - Handles Google Sheets integration
- `credentials.json` - Google API credentials
- `events.json` - Scraped event data
- `images/` - Contains screenshots for debugging and documentation

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Google Sheets API:
   - Create credentials.json from Google Cloud Console
   - Share your Google Sheet with the service account email

3. Run the scraper:
```bash
node full-scraper.js
```

## Dependencies
- Google APIs
- Puppeteer (for web scraping)
