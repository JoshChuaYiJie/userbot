const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const puppeteerExtraStealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = require('puppeteer-extra');

puppeteerExtra.use(puppeteerExtraStealthPlugin());

// File paths configuration
const accountsFilePath = path.join(__dirname, 'accounts_to_follow.txt');
const followedFilePath = '/app/followed.txt';

// Track followed accounts
let followedAccounts = [];
let accountsToProcess = [];
const SESSION_ID = '6437903867%3AoFZ3u9GEJEQgCy%3A22%3AAYdOFOt2V1D747AGApJTu9NrL7rD8NEq7DwwFHbfVQ'; // Hardcoded sessionid

// Helper function to get current hour in Singapore time
function getSingaporeHour() {
  const options = { timeZone: 'Asia/Singapore', hour: 'numeric', hour12: false };
  return parseInt(new Date().toLocaleString('en-US', options), 10);
}

// Read accounts from file
function readAccountsFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return [];
    }
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf8');
    if (ext === '.csv') return content.split(/[\r\n,]+/).filter(username => username.trim());
    else if (ext === '.txt') return content.split(/[\r\n]+/).filter(username => username.trim());
    else if (ext === '.json') {
      const data = JSON.parse(content);
      if (Array.isArray(data)) return data.map(item => typeof item === 'string' ? item : item.username || item.user || '').filter(Boolean);
      else if (data.accounts || data.usernames || data.users) {
        const accounts = data.accounts || data.usernames || data.users;
        return Array.isArray(accounts) ? accounts : [];
      }
    }
    return content.split(/[\r\n]+/).filter(username => username.trim());
  } catch (error) {
    console.error(`Error reading accounts file: ${error.message}`);
    return [];
  }
}

// Load previously followed accounts
function loadFollowedAccounts() {
  try {
    if (fs.existsSync(followedFilePath)) {
      followedAccounts = fs.readFileSync(followedFilePath, 'utf8')
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.split(',')[0]);
      console.log(`Loaded ${followedAccounts.length} previously followed accounts from ${followedFilePath}`);
    } else {
      console.log(`No existing followed.txt found at ${followedFilePath}, starting fresh`);
      fs.writeFileSync(followedFilePath, '');
    }
  } catch (error) {
    console.error(`Error loading followed accounts: ${error.message}`);
    fs.writeFileSync(followedFilePath, '');
  }
}

// Save followed account
function saveFollowedAccount(username) {
  if (!followedAccounts.includes(username)) {
    followedAccounts.push(username);
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' });
    try {
      fs.appendFileSync(followedFilePath, `${username},${timestamp}\n`);
      console.log(`Saved ${username} to ${followedFilePath}`);
    } catch (error) {
      console.error(`Error saving ${username} to ${followedFilePath}: ${error.message}`);
    }
  }
}

// Random wait time function
function getRandomWaitTime(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Human-like scrolling function
async function humanLikeScroll(page) {
  await page.evaluate(async () => {
    const scrollHeight = document.body.scrollHeight;
    const viewportHeight = window.innerHeight;
    let currentPosition = 0;
    const scrollActions = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < scrollActions; i++) {
      const scrollDistance = Math.floor(Math.random() * (viewportHeight * 0.8)) + (viewportHeight * 0.3);
      currentPosition += scrollDistance;
      if (currentPosition > scrollHeight) currentPosition = scrollHeight;
      window.scrollTo({ top: currentPosition, behavior: 'smooth' });
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 500));
    }
    if (Math.random() > 0.7) {
      currentPosition -= Math.floor(Math.random() * (viewportHeight * 0.5));
      if (currentPosition < 0) currentPosition = 0;
      window.scrollTo({ top: currentPosition, behavior: 'smooth' });
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    }
  });
}

// Start browser instance (single instance)
async function startBrowser() {
  console.log('Starting browser...');
  const browser = await puppeteerExtra.launch({ 
    headless: true, 
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--disable-crash-reporter',
      '--single-process',
      '--window-size=1920,1080'
    ],
    timeout: 60000
  });
  console.log('Browser started successfully');
  return browser;
}

// Create a new page with sessionid
async function createPage(browser) {
  console.log('Creating new page...');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { 
      get: () => [
        { 0: {type: "application/pdf", suffixes: "pdf", description: "Portable Document Format"}, name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format", length: 1 },
        { 0: {type: "application/pdf", suffixes: "pdf", description: "Portable Document Format"}, name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "Portable Document Format", length: 1 }
      ]
    });
  });
  await page.setCookie({
    name: 'sessionid',
    value: SESSION_ID,
    domain: '.instagram.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    expires: -1
  });
  console.log('Page created with sessionid');
  return page;
}

// Follow accounts in a batch
async function followAccountsBatch(page, startIndex, maxBatchSize) {
  const hour = getSingaporeHour();
  let maxPerHour = 20;
  if (hour >= 1 && hour <= 6) maxPerHour = 5;
  else if (hour >= 23 || hour < 1) maxPerHour = 10;
  const batchSize = Math.min(maxPerHour, maxBatchSize, accountsToProcess.length - startIndex);
  console.log(`Using batch size of ${batchSize} follows for this session`);
  
  let followedCount = 0;
  for (let i = 0; i < batchSize; i++) {
    const username = accountsToProcess[startIndex + i];
    try {
      console.log(`Visiting profile: ${username}`);
      await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, getRandomWaitTime(2000, 5000)));
      try {
        await page.waitForSelector('header', { timeout: 10000 });
      } catch (error) {
        console.log(`Profile page for ${username} did not load: ${error.message}`);
        continue;
      }
      if (Math.random() > 0.3) {
        console.log(`Browsing ${username}'s profile...`);
        await humanLikeScroll(page);
      }
      if (Math.random() > 0.5) {
        const { width, height } = page.viewport();
        await page.mouse.move(Math.floor(Math.random() * width * 0.8) + width * 0.1, Math.floor(Math.random() * height * 0.8) + height * 0.1, { steps: 10 });
      }
      const followResult = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('header button'));
        const followButton = buttons.find(btn => btn.textContent.trim() === 'Follow');
        if (followButton) {
          followButton.click();
          return { success: true };
        }
        return { success: false, availableButtons: buttons.map(btn => btn.textContent.trim()) };
      });
      if (followResult.success) {
        console.log(`Followed ${username} (#${followedCount + 1})`);
        followedCount++;
        saveFollowedAccount(username);
        await new Promise(resolve => setTimeout(resolve, getRandomWaitTime(1500, 3500)));
        if (Math.random() > 0.5) await humanLikeScroll(page);
      } else {
        console.log(`No "Follow" button for ${username}: ${JSON.stringify(followResult.availableButtons)}`);
      }
      await new Promise(resolve => setTimeout(resolve, getRandomWaitTime(3000, 8000)));
    } catch (error) {
      console.error(`Failed to follow ${username}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, getRandomWaitTime(2000, 4000)));
    }
  }
  console.log(`Followed ${followedCount} accounts this batch`);
  return followedCount;
}

// Main bot function
async function runBot() {
  loadFollowedAccounts();
  const accountsToFollow = readAccountsFromFile(accountsFilePath);
  accountsToProcess = accountsToFollow.filter(account => !followedAccounts.includes(account));
  if (accountsToProcess.length === 0) {
    console.log('No new accounts to follow.');
    return;
  }
  console.log(`Loaded ${accountsToFollow.length} accounts, ${accountsToProcess.length} new to follow`);
  let processedCount = 0;

  let browser;
  try {
    browser = await startBrowser();
    while (processedCount < accountsToProcess.length) {
      const hour = getSingaporeHour();
      if (hour >= 2 && hour < 5) {
        console.log("Sleeping during night hours (2am-5am SGT)");
        await new Promise(resolve => setTimeout(resolve, getRandomWaitTime(20, 40) * 60 * 1000));
        continue;
      }
      console.log(`Starting batch at index ${processedCount} (${new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' })})`);
      let page = await createPage(browser);
      try {
        await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        const isLoggedIn = await page.evaluate(() => !!document.querySelector('a[href*="/accounts/"]'));
        if (!isLoggedIn) {
          console.error('Sessionid invalid. Please update SESSION_ID and redeploy.');
          break;
        }
        console.log('Logged in successfully');
        const followedCount = await followAccountsBatch(page, processedCount, 20);
        processedCount += followedCount;
        if (processedCount % 50 === 0) {
          const updatedAccounts = readAccountsFromFile(accountsFilePath);
          const updatedToProcess = updatedAccounts.filter(account => !followedAccounts.includes(account));
          if (updatedToProcess.length > accountsToProcess.length - processedCount) {
            console.log("Found new accounts, updating list");
            const remainingOld = accountsToProcess.slice(processedCount);
            const newAccounts = updatedToProcess.filter(account => !remainingOld.includes(account));
            accountsToProcess.length = processedCount;
            accountsToProcess.push(...remainingOld, ...newAccounts);
            console.log(`Updated list: ${accountsToProcess.length - processedCount} to process`);
          }
        }
        await page.close();
        console.log('Page closed after batch');
        if (processedCount < accountsToProcess.length) {
          let baseWaitMinutes = 60;
          if (hour >= 22 || hour < 6) baseWaitMinutes = 90;
          else if (hour >= 11 && hour <= 20) baseWaitMinutes = 50;
          const waitTimeMinutes = baseWaitMinutes + getRandomWaitTime(-10, 10);
          console.log(`Waiting ~${waitTimeMinutes} minutes before next batch`);
          await new Promise(resolve => setTimeout(resolve, waitTimeMinutes * 60 * 1000));
        }
      } catch (error) {
        console.error('Batch error:', error.message);
        console.log('Waiting 15 minutes before retrying batch...');
        if (!page.isClosed()) await page.close();
        await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
      }
    }
  } catch (error) {
    console.error('Run error:', error.message);
  } finally {
    if (browser) await browser.close();
    console.log('Browser closed, finished following all accounts.');
  }
}

// Start the bot
(async () => {
  try {
    await runBot();
  } catch (error) {
    console.error('Fatal error:', error);
  }
})();