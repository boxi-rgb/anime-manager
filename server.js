const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to prevent access to server.js and package files
app.use((req, res, next) => {
    if (req.path === '/server.js' || req.path === '/package.json' || req.path === '/package-lock.json') {
        return res.status(403).send('Forbidden');
    }
    next();
});

// Serve static files from the current directory
app.use(express.static(path.join(__dirname, '.')));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
