var express = require('express');
var router = express.Router();

/* GET snake game page. */
router.get('/snake', function(req, res, next) {
  res.render('snake', { title: 'Snake Game' });
});

module.exports = router;
