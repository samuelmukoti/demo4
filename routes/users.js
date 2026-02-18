var express = require('express');
var router = express.Router();

/* GET users page. */
router.get('/', function(req, res, next) {
  res.render('users', { title: 'Users' });
});

/* GET users data. */
router.get('/data', function(req, res, next) {
  setTimeout(function() {
    res.json([
      { id: 1, name: 'Alice Johnson', email: 'alice@example.com' },
      { id: 2, name: 'Bob Smith', email: 'bob@example.com' },
      { id: 3, name: 'Carol Williams', email: 'carol@example.com' },
      { id: 4, name: 'David Brown', email: 'david@example.com' },
      { id: 5, name: 'Eve Davis', email: 'eve@example.com' }
    ]);
  }, 1200);
});

module.exports = router;
