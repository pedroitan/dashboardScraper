/**
 * Main Sympla event scraper
 * 
 * This script scrapes event data from Sympla's website using Puppeteer.
 * It handles pagination, extracts event details, and saves results to:
 * - Local JSON file (events.json)
 * - Google Sheets (via google-sheets-writer.js)
 * 
 * Dependencies:
 * - puppeteer: For browser automation and web scraping
 * - google-sheets-writer: For Google Sheets integration
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { writeEventsToSheet } = require('./google-sheets-writer');

// Main scraping function
(async () => {
  // Initialize Puppeteer browser with configuration
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    timeout: 30000
  });
  
  // Create new browser page
  const page = await browser.newPage();
  // Array to store all collected events
  const allEvents = [];
  
  try {
    // --------------------------
    // Initial Page Navigation
    // --------------------------
    // Navigate to Sympla events page for Salvador, BA
    // Filters set for current month's events
    await page.goto('https://www.sympla.com.br/eventos/salvador-ba/show-musica-festa/este-mes?d=2025-01-01,2025-01-31', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Pagination tracking
    let pageNumber = 1;          // Current page number
    let hasNextPage = true;      // Flag to continue pagination
    
    while (hasNextPage) {
      console.log(`Processing page ${pageNumber}`);
      
      // Wait for event cards to load completely with better error handling
      try {
        await page.waitForSelector('.sympla-card', { timeout: 30000 });
      } catch (error) {
        console.error('Error waiting for event cards:', error);
        await page.screenshot({ path: `event-cards-error-page-${pageNumber}.png` });
        throw error;
      }
      
      // Extract event data from current page
      // Uses page.evaluate to run code in browser context
      const events = await page.evaluate(() => {
        // --------------------------
        // Event Data Extraction
        // --------------------------
        const items = Array.from(document.querySelectorAll('.sympla-card'));
        return items.map(item => {
          const dateTime = item.querySelector('.qtfy414')?.textContent?.trim() || '';
          let [date, time] = dateTime && dateTime.includes(' às ') ? 
            dateTime.split(' às ') : 
            [dateTime || 'Data não especificada', null];
            
          // Convert date format from various formats to "DD/MM/YYYY"
          if (date) {
            const monthMap = {
              'Jan': '01', 'Fev': '02', 'Mar': '03',
              'Abr': '04', 'Mai': '05', 'Jun': '06',
              'Jul': '07', 'Ago': '08', 'Set': '09',
              'Out': '10', 'Nov': '11', 'Dez': '12'
            };
            
            // Handle all date formats containing "DD de MMM"
            const dateMatch = date.match(/(\d{1,2}) de (\w{3})/);
            if (dateMatch) {
              const [, day, monthName] = dateMatch;
              const month = monthMap[monthName] || '01';
              const currentYear = new Date().getFullYear();
              date = `${day.padStart(2, '0')}/${month}/${currentYear}`;
            }
            // Handle date range format: "16 de Dez a 31 de Dez"
            else if (date.match(/\d{1,2} de \w{3} a \d{1,2} de \w{3}/)) {
              const [, startDay, startMonth, endDay, endMonth] = 
                date.match(/(\d{1,2}) de (\w{3}) a (\d{1,2}) de (\w{3})/);
              const currentYear = new Date().getFullYear();
              date = `${startDay.padStart(2, '0')}/${monthMap[startMonth] || '01'} a ${endDay.padStart(2, '0')}/${monthMap[endMonth] || '01'}/${currentYear}`;
            }
            // Handle multi-day format: "25 de Jan a 26 de Jan"
            else if (date.match(/\d{1,2} de \w{3} a \d{1,2} de \w{3}/)) {
              const [, startDay, startMonth, endDay, endMonth] = 
                date.match(/(\d{1,2}) de (\w{3}) a (\d{1,2}) de (\w{3})/);
              const currentYear = new Date().getFullYear();
              date = `${startDay.padStart(2, '0')}/${monthMap[startMonth] || '01'} a ${endDay.padStart(2, '0')}/${monthMap[endMonth] || '01'}/${currentYear}`;
            }
          }

          const name = item.querySelector('.pn67h18')?.textContent?.trim() || 'Evento sem nome';
          const location = item.querySelector('.pn67h1a')?.textContent?.trim() || 'Local não especificado';
          const imageUrl = item.querySelector('img[src*=".jpg"], img[src*=".png"]')?.src || '';
          // Get absolute URL for the event using more specific selector
          const url = item.closest('a[href*="/evento/"]')?.href || 
                     item.querySelector('a[href*="/evento/"]')?.href;
          const absoluteUrl = url ? new URL(url, window.location.href).href : '';

          return {
            Title: name,
            Date: date,
            Time: time,
            Location: location,
            Type: 'Sympla', // Set default type for all events
            URL: url,
            ImageURL: imageUrl
          };
        }).filter(event => event !== null); // Filter out null entries
      });

      // Add current page's events to master list
      allEvents.push(...events);
      console.log(`Found ${events.length} events on page ${pageNumber}`);

      // Scroll to bottom to ensure pagination controls are visible
      // Helps prevent issues with buttons being off-screen
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Take screenshot of pagination area for debugging
      // Saves as pagination-page-{number}.png
      const pagination = await page.$('._1xzb3su0');
      if (pagination) {
        await pagination.screenshot({ path: `pagination-page-${pageNumber}.png` });
      }

      // Find the "Próximo" (Next) button using more reliable selectors
      const nextButton = await page.evaluateHandle(() => {
        // Try multiple selector strategies
        const selectors = [
          'button[data-testid="pagination-next-button"]', // Primary selector
          'button[aria-label="Próxima página"]', // Accessible alternative
          'button[aria-label="Next page"]', // English alternative
          'button[title="Próxima página"]', // Title-based alternative
          'button[title="Next page"]', // English title alternative
          'a[aria-label="Próxima página"]', // Link-based alternative
          'a[aria-label="Next page"]' // English link alternative
        ];
        
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            return element;
          }
        }
        console.error('Next button not found using any selector');
        return null;
      });

      // Add error handling for null nextButton
      if (!nextButton) {
        console.log('No next page button found');
        await page.screenshot({ path: 'no-next-button.png', fullPage: true });
        hasNextPage = false;
        break;
      }
      
      if (!nextButton) {
        console.log('No next page button found');
        await page.screenshot({ path: 'no-next-button.png', fullPage: true });
        hasNextPage = false;
        break;
      }

      try {
        // Try clicking the next button
        console.log('Attempting to navigate to next page...');
        const currentUrl = page.url();
        
        // First try clicking the button
        try {
          await nextButton.click();
          await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
        } catch (clickError) {
          // If click fails, try navigating via URL
          console.log('Button click failed, trying URL navigation...');
          const nextPageUrl = await page.evaluate(() => {
            // Try to find the next page URL in pagination
            const pagination = document.querySelector('._1xzb3su0');
            if (pagination) {
              const nextLink = pagination.querySelector('a[href*="page="]');
              if (nextLink) {
                return nextLink.href;
              }
            }
            
            // Fallback to incrementing page number in URL
            const currentUrl = window.location.href;
            const pageMatch = currentUrl.match(/page=(\d+)/);
            if (pageMatch) {
              const currentPage = parseInt(pageMatch[1]);
              return currentUrl.replace(/page=\d+/, `page=${currentPage + 1}`);
            }
            
            // If no page parameter exists, add it
            return currentUrl + (currentUrl.includes('?') ? '&' : '?') + 'page=2';
          });
          
          await page.goto(nextPageUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        }

        // Verify we actually changed pages
        const newUrl = page.url();
        if (newUrl === currentUrl) {
          console.error('Page did not change after navigation attempt');
          hasNextPage = false;
          await page.screenshot({ path: 'page-not-changed.png' });
          break;
        }
        
        // Wait for new content to load
        await page.waitForSelector('.sympla-card', { timeout: 30000 });
        pageNumber++;
        console.log(`Successfully navigated to page ${pageNumber}`);
      } catch (error) {
        console.error('Error navigating to next page:', error);
        hasNextPage = false;
        await page.screenshot({ path: 'navigation-error.png' });
      }
    }

    // --------------------------
    // Data Persistence
    // --------------------------
    
    // Save all collected events to JSON file in the correct directory
    const eventsPath = path.join(__dirname, 'events.json');
    fs.writeFileSync(eventsPath, JSON.stringify(allEvents, null, 2));
    console.log(`Saved ${allEvents.length} total events to ${eventsPath}`);

    // Write events to Google Sheet using helper module
    // Handles authentication and data formatting
    console.log('Writing events to Google Sheet...');
    try {
      await writeEventsToSheet();
      console.log('Successfully wrote events to Google Sheet');
    } catch (error) {
    // --------------------------
    // Error Handling
    // --------------------------
    // Log errors and take screenshot for debugging
      console.error('Error writing to Google Sheet:', error);
      throw error;
    }

  } catch (error) {
    console.error('Error during scraping:', error);
    await page.screenshot({ path: 'scrape-error.png' });
  } finally {
    // --------------------------
    // Cleanup
    // --------------------------
    // Ensure browser is closed even if errors occur
    await browser.close();
    console.log('Browser closed');
  }
})();
