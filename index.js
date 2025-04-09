const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const puppeteerExtraStealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = require('puppeteer-extra');

// Add the stealth plugin to puppeteer
puppeteerExtra.use(puppeteerExtraStealthPlugin());

// File paths configuration
const accountsFilePath = path.join(__dirname, 'accounts_to_follow.txt');
const followedFilePath = path.join(__dirname, 'followed.txt');

// Track followed accounts (global because we need this across browser sessions)
let followedAccounts = [];
let accountsToProcess = [];

// Read accounts from file
function readAccountsFromFile(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return [];
    }
    
    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (ext === '.csv') {
      // Simple CSV parsing (assuming one username per line or comma-separated)
      return content.split(/[\r\n,]+/).filter(username => username.trim().length > 0);
    } else if (ext === '.txt') {
      // Simple text file parsing (one username per line)
      return content.split(/[\r\n]+/).filter(username => username.trim().length > 0);
    } else if (ext === '.json') {
      // JSON parsing
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        return data.map(item => typeof item === 'string' ? item : item.username || item.user || '').filter(Boolean);
      } else if (data.accounts || data.usernames || data.users) {
        const accounts = data.accounts || data.usernames || data.users;
        return Array.isArray(accounts) ? accounts : [];
      }
    }
    
    // Default: just split by newlines
    return content.split(/[\r\n]+/).filter(username => username.trim().length > 0);
  } catch (error) {
    console.error(`Error reading accounts file: ${error.message}`);
    return [];
  }
}

// Load previously followed accounts
function loadFollowedAccounts() {
  if (fs.existsSync(followedFilePath)) {
    followedAccounts = fs.readFileSync(followedFilePath, 'utf8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.split(',')[0]); // Extract just the username part
    console.log(`Loaded ${followedAccounts.length} previously followed accounts`);
  }
}

// Function to save followed account to file
function saveFollowedAccount(username) {
  if (!followedAccounts.includes(username)) {
    followedAccounts.push(username);
    // Append to file with timestamp
    const timestamp = new Date().toISOString();
    fs.appendFileSync(followedFilePath, `${username},${timestamp}\n`);
    console.log(`Saved ${username} to followed accounts file`);
  }
}

// Random wait time function to make behavior more human-like
function getRandomWaitTime(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Human-like scrolling function
async function humanLikeScroll(page) {
  await page.evaluate(async () => {
    const scrollHeight = document.body.scrollHeight;
    const viewportHeight = window.innerHeight;
    let currentPosition = 0;
    
    // Determine a random number of scroll actions (2-5)
    const scrollActions = Math.floor(Math.random() * 4) + 2;
    
    for (let i = 0; i < scrollActions; i++) {
      // Calculate a random scroll distance
      const scrollDistance = Math.floor(Math.random() * (viewportHeight * 0.8)) + (viewportHeight * 0.3);
      currentPosition += scrollDistance;
      
      // Don't scroll beyond the page
      if (currentPosition > scrollHeight) {
        currentPosition = scrollHeight;
      }
      
      // Smooth scroll with variable speed
      window.scrollTo({
        top: currentPosition,
        behavior: 'smooth'
      });
      
      // Random pause between scrolls (500ms - 2000ms)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 500));
    }
    
    // Sometimes scroll back up a bit
    if (Math.random() > 0.7) {
      currentPosition -= Math.floor(Math.random() * (viewportHeight * 0.5));
      if (currentPosition < 0) currentPosition = 0;
      
      window.scrollTo({
        top: currentPosition,
        behavior: 'smooth'
      });
      
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    }
  });
}

// Function to start a new browser session
async function startBrowserSession() {
  try {
    console.log('Starting Browserless session...');
    const token = 'ty9M67Qb7jT4OJ0RVMqXwTdGubGsDQ8d';
    const endpoint = 'ws://browserless-qg8wskkgckssk0c4w0gcgocw:3000?token=' + token;
    console.log('Connecting to:', endpoint);
    const browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
    console.log('Connected to Browserless!');
    const page = await browser.newPage();
    console.log('Page created');
    await page.setViewport({ width: 1280, height: 800 });
    console.log('Viewport set');
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36');
    console.log('User agent set');
    await page.evaluateOnNewDocument(() => {});
    console.log('Fingerprinting applied');
    await page.setCookie({
      name: 'sessionid',
      value: '6437903867%3AdHyky5yQ1iPSon%3A28%3AAYeilioihR_NN8hwlaXiZsjqKm9XaEt_PwLx0ZGjlA',
      domain: '.instagram.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      expires: -1
    });
    console.log('Cookie set');
    return { browser, page };
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error:', error);
    throw error;
  }
}

// Function to follow accounts in a single batch
async function followAccountsBatch(page, startIndex, maxBatchSize) {
  // Calculate dynamic batch size based on time of day
  const hour = new Date().getHours();
  let maxPerHour = 20; // Default Instagram rate limit
  
  // Reduce activity during night hours (assuming bot runs in local timezone)
  if (hour >= 1 && hour <= 6) {
    maxPerHour = 5; // Much lower activity at night
  } else if (hour >= 23 || hour < 1) {
    maxPerHour = 10; // Reduced activity late night
  }
  
  const batchSize = Math.min(maxPerHour, maxBatchSize, accountsToProcess.length - startIndex);
  console.log(`Using batch size of ${batchSize} follows for this session`);
  
  let followedCount = 0;

  for (let i = 0; i < batchSize; i++) {
    const username = accountsToProcess[startIndex + i];
    
    try {
      // Navigate to the user's profile
      console.log(`Visiting profile: ${username}`);
      await page.goto(`https://www.instagram.com/${username}/`, { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Random delay after page load to mimic reading/looking at profile
      await new Promise(resolve => setTimeout(resolve, getRandomWaitTime(2000, 5000)));

      // Wait for the profile page to load
      try {
        await page.waitForSelector('header', { timeout: 10000 });
      } catch (error) {
        console.log(`Profile page for ${username} did not load properly: ${error.message}`);
        continue;
      }

      // Sometimes look at the profile by scrolling
      if (Math.random() > 0.3) {  // 70% chance to scroll
        console.log(`Browsing ${username}'s profile...`);
        await humanLikeScroll(page);
      }

      // Sometimes move mouse randomly before clicking (more human-like)
      if (Math.random() > 0.5) {
        const viewportWidth = page.viewport().width;
        const viewportHeight = page.viewport().height;
        
        await page.mouse.move(
          Math.floor(Math.random() * viewportWidth * 0.8) + viewportWidth * 0.1,
          Math.floor(Math.random() * viewportHeight * 0.8) + viewportHeight * 0.1,
          { steps: 10 }
        );
      }

      // Use evaluate to find and click the Follow button
      const followResult = await page.evaluate(() => {
        // Find all buttons in the header area
        const buttons = Array.from(document.querySelectorAll('header button'));
        
        // Find the Follow button
        const followButton = buttons.find(btn => {
          const text = btn.textContent.trim();
          return text === 'Follow';
        });
        
        if (followButton) {
          // Click the button directly within the evaluate function
          followButton.click();
          return { success: true };
        } else {
          return { 
            success: false, 
            availableButtons: buttons.map(btn => btn.textContent.trim())
          };
        }
      });

      if (followResult.success) {
        console.log(`Followed ${username} (#${followedCount + 1})`);
        followedCount++;
        
        // Save followed account to file
        saveFollowedAccount(username);
        
        // After following, wait a bit as a human would
        await new Promise(resolve => setTimeout(resolve, getRandomWaitTime(1500, 3500)));
        
        // Sometimes explore a bit more after following
        if (Math.random() > 0.5) {
          await humanLikeScroll(page);
        }
      } else {
        console.log(`No "Follow" button found for ${username}. Available buttons: ${JSON.stringify(followResult.availableButtons)}`);
      }

      // Variable delay between operations to mimic human behavior (3-8 seconds)
      await new Promise(resolve => setTimeout(resolve, getRandomWaitTime(3000, 8000)));
    } catch (error) {
      console.error(`Failed to follow ${username}:`, error.message);
      await new Promise(resolve => setTimeout(resolve, getRandomWaitTime(2000, 4000)));
    }
  }

  console.log(`Followed ${followedCount} accounts this batch`);
  return followedCount;
}

// Main function to run the bot
async function runBot() {
  // Load previously followed accounts
  loadFollowedAccounts();
  
  // Read accounts to follow from file
  const accountsToFollow = readAccountsFromFile(accountsFilePath);
  
  // Filter out already followed accounts
  accountsToProcess = accountsToFollow.filter(account => !followedAccounts.includes(account));
  
  if (accountsToProcess.length === 0) {
    console.log('No new accounts to follow. All accounts in the list have been processed.');
    return;
  }
  
  console.log(`Loaded ${accountsToFollow.length} accounts, ${accountsToProcess.length} new accounts to follow`);
  
  let processedCount = 0;
  
  // Main loop - continues until all accounts are processed
  while (processedCount < accountsToProcess.length) {
    // Get current time information
    const now = new Date();
    const hour = now.getHours();
    
    // Skip execution during deep night hours (2am-5am) to appear more human-like
    if (hour >= 2 && hour < 5) {
      console.log("Sleeping during night hours (2am-5am) to mimic human sleep patterns");
      // Sleep for 20-40 minutes then check again
      await new Promise(resolve => setTimeout(resolve, getRandomWaitTime(20, 40) * 60 * 1000));
      continue;
    }
    
    console.log(`Starting batch at index ${processedCount} (${new Date().toLocaleString()})`);
    
    try {
      // Start a new browser session for this batch
      const { browser, page } = await startBrowserSession();
      
      // Navigate to Instagram and verify login
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
      
      // Check if logged in
      const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('a[href*="/accounts/"]');
      });
      
      if (!isLoggedIn) {
        console.error('Session cookie is invalid or expired. Please update the sessionid.');
        await browser.close();
        return;
      }
      
      console.log('Logged in successfully for this session');
      
      // Follow accounts in this batch
      const followedCount = await followAccountsBatch(page, processedCount, 20);
      processedCount += followedCount;
      
      // Close the browser completely at the end of the batch
      console.log('Closing browser session');
      await browser.close();
      
      // Check if we should refresh our account list
      if (processedCount % 50 === 0) {
        // Re-read the accounts file to check for updates
        const updatedAccounts = readAccountsFromFile(accountsFilePath);
        const updatedAccountsToProcess = updatedAccounts.filter(account => !followedAccounts.includes(account));
        
        if (updatedAccountsToProcess.length > accountsToProcess.length - processedCount) {
          console.log("Found new accounts in the file, updating the processing list");
          const remainingOldAccounts = accountsToProcess.slice(processedCount);
          const newAccounts = updatedAccountsToProcess.filter(
            account => !remainingOldAccounts.includes(account)
          );
          
          // Update our list with remaining old accounts plus newly found accounts
          accountsToProcess.length = processedCount; // Truncate to what we've processed
          accountsToProcess.push(...remainingOldAccounts, ...newAccounts);
          
          console.log(`Updated processing list, now contains ${accountsToProcess.length - processedCount} accounts to process`);
        }
      }
      
      // If there are more accounts to process, take a longer break between batches
      if (processedCount < accountsToProcess.length) {
        // Add some variety to the hour wait to seem more human
        // Use different wait times based on time of day
        let baseWaitMinutes = 60; // Default 1 hour
        
        // Longer waits at night
        if (hour >= 22 || hour < 6) {
          baseWaitMinutes = 90; // 1.5 hours at night
        }
        // Shorter waits during active Instagram hours
        else if (hour >= 11 && hour <= 20) {
          baseWaitMinutes = 50; // ~50 min during peak hours
        }
        
        // Add some randomness to the wait time
        const varianceMinutes = 10;
        const waitTimeMinutes = baseWaitMinutes + getRandomWaitTime(-varianceMinutes, varianceMinutes);
        const waitTimeMs = waitTimeMinutes * 60 * 1000;
        
        console.log(`Waiting approximately ${waitTimeMinutes} minutes before the next batch...`);
        await new Promise(resolve => setTimeout(resolve, waitTimeMs));
      }
    } catch (error) {
      console.error('Session error:', error);
      console.log('Waiting 15 minutes before retry...');
      await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
    }
  }
  
  console.log('Finished following all accounts in the list.');
}

// Start the bot
(async () => {
  try {
    await runBot();
  } catch (error) {
    console.error('Fatal error:', error);
  }
})();