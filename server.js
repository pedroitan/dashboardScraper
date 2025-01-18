const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Track scraper status
let scraperStatus = {
  elcabong: {
    lastRun: null,
    eventCount: 0
  },
  sympla: {
    lastRun: null,
    eventCount: 0
  }
};

// Serve static files
app.use(express.static('public'));

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Run El Cabong scraper
app.get('/run-elcabong', (req, res) => {
  exec('node "scrapper elcabong/complete-scraper.js"', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error running El Cabong scraper: ${error.message}`);
      return res.status(500).json({ error: 'Scraper failed' });
    }

    // Parse event count from output or use 0 if not found
    let eventCount = 0;
    const match = stdout.match(/Successfully (?:wrote|parsed) (\d+) events/);
    if (match) {
      eventCount = parseInt(match[1]);
    }
    
    // Update status
    scraperStatus.elcabong = {
      lastRun: new Date(),
      eventCount: eventCount
    };

    res.json(scraperStatus.elcabong);
  });
});

// Run Sympla scraper
app.get('/run-sympla', (req, res) => {
  exec('node "scrapper sympla/full-scraper.js"', { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
    // Log all output for debugging
    console.log('Sympla scraper output:');
    console.log(stdout);
    if (stderr) {
      console.error('Sympla scraper errors:');
      console.error(stderr);
    }

    if (error) {
      console.error(`Error running Sympla scraper: ${error.message}`);
      return res.status(500).json({ 
        error: 'Scraper failed',
        details: error.message,
        output: stdout,
        errors: stderr
      });
    }

    // Parse event count from output or use 0 if not found
    let eventCount = 0;
    const match = stdout.match(/Successfully (?:wrote|parsed) (\d+) events/);
    if (match) {
      eventCount = parseInt(match[1]);
    }
    
    // Update status
    scraperStatus.sympla = {
      lastRun: new Date(),
      eventCount: eventCount
    };

    res.json({
      ...scraperStatus.sympla,
      output: stdout // Include output in response for debugging
    });
  });
});

// Get scraper status
app.get('/status', (req, res) => {
  res.json(scraperStatus);
});

app.listen(port, () => {
  console.log(`Dashboard running at http://localhost:${port}`);
});
