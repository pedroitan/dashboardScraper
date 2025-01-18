/**
 * Google Sheets Writer Module
 * 
 * Handles writing event data to Google Sheets, including:
 * - Authentication with Google Sheets API
 * - Data formatting and transformation
 * - Duplicate detection
 * - Batch writing of new events
 * 
 * Dependencies:
 * - googleapis: Official Google API client library
 */

const { google } = require('googleapis');
// Node.js file system module for reading event data
const fs = require('fs');
const path = require('path');
// Google service account credentials
const credentials = require('./firm-reef-447023-b0-93c82563ab42.json');

// Google Sheet ID extracted from the sheet's URL
// Format: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit
const SHEET_ID = '1184qmC-7mpZtpg15R--il4K3tVxSTAcJUZxpWf9KFAs';

/**
 * Main function to write events to Google Sheet
 * 
 * Handles the complete workflow:
 * 1. Reads event data from events.json
 * 2. Formats data for Google Sheets
 * 3. Authenticates with Google Sheets API
 * 4. Checks for duplicates
 * 5. Writes new events to the sheet
 * 
 * @throws {Error} If any step in the process fails
 */
module.exports.writeEventsToSheet = async function() {
  try {
    // --------------------------
    // Data Preparation
    // --------------------------
    // Read and parse event data from JSON file
    const eventsPath = path.join(__dirname, 'events.json');
    const events = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
    console.log(`Read ${events.length} events from ${eventsPath}`);
    
    // Transform event data into 2D array format for Google Sheets
    // First row contains headers, subsequent rows contain event data
    const values = [
      ['Title', 'Date', 'Time', 'Location', 'Type', 'URL', 'Image URL'], // Header row
      ...events.map(event => [
        event.Title,
        event.Date,
        event.Time || '',
        event.Location,
        event.Type || '',
        event.URL || '',
        event.ImageURL || ''
      ])
    ];
    console.log('Prepared data for Google Sheets');

    // --------------------------
    // Authentication
    // --------------------------
    // Create JWT client using service account credentials
    const authClient = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    await authClient.authorize();
    console.log('Authenticated with Google Sheets API');
    
    // Initialize Google Sheets API client
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // --------------------------
    // Sheet Metadata
    // --------------------------
    // Retrieve spreadsheet metadata to get sheet name
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID
    });
    const sheetName = spreadsheet.data.sheets[0].properties.title;
    console.log(`Using sheet: ${sheetName}`);
    
    // --------------------------
    // Duplicate Detection
    // --------------------------
    // Read existing data to check for duplicates
    console.log('Reading existing data...');
    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A2:Z`
    });
    
    const existingEvents = existingResponse.data.values || [];
    console.log(`Found ${existingEvents.length} existing events`);
    
    // Filter out duplicates by comparing event URLs
    // Uses Set for O(1) lookup time
    const existingUrls = new Set(existingEvents.map(row => row[5])); // URL is in column F (index 5)
    const newEvents = values.slice(1).filter(row => !existingUrls.has(row[5]));
    
    if (newEvents.length === 0) {
      console.log('No new events to add');
      return;
    }
    
    // --------------------------
    // Data Writing
    // --------------------------
    // Append new events to the sheet
    console.log(`Appending ${newEvents.length} new events...`);
    try {
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: {
          values: newEvents
        }
      });
      
      if (response.status === 200) {
        console.log(`Successfully wrote ${events.length} events to Google Sheet`);
        console.log('Updated range:', response.data.updatedRange);
        console.log('Updated rows:', response.data.updatedRows);
        console.log('Updated columns:', response.data.updatedColumns);
      } else {
        console.error('Unexpected response from Google Sheets API:', response);
        console.error('Response data:', response.data);
      }
    } catch (error) {
    // --------------------------
    // Error Handling
    // --------------------------
    // Log detailed error information
      console.error('Error writing to Google Sheet:');
      console.error('Error details:', error.response?.data || error.message);
      throw error;
    }
  } catch (error) {
    console.error('Fatal error in Google Sheets writer:', error);
    throw error;
  }
}
