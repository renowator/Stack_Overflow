const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000
const {
  Client
} = require('pg');

const database = new Client({
  connectionString: 'postgres://rzolioxhicdcbq:2dcdefed515615296c818c19a1bae98a6dac3962ac5de97c5e200deb80539b08@ec2-23-21-166-148.compute-1.amazonaws.com:5432/df31neji5vbebi',
  ssl: true,
});

database.connect();

var results = 0;

function search(req, res, next) {
  var searchTerm = req.query.search;
  var category = req.query.category;

  if (category === undefined || category === "") {
    database.query('SELECT Image FROM Posting WHERE Name ~~* $1', ['%' + searchTerm + '%'], (err, result) => {
      if (err) {
        req.searchResult = "";
        req.searchTerm = "";
        req.category = "";
        next();
      }

      req.searchResult = result.rows.map(x => String(x.image));
      req.searchTerm = searchTerm;
      req.category = "";
      next();
    });
  } else {
    database.query('SELECT Image FROM Posting WHERE Category = $1 AND Name ~~* $2', [category, '%' + searchTerm + '%'], (err, result) => {
      if (err) {
        req.searchResult = "";
        req.searchTerm = "";
        req.category = "";
        next();
      }

      if (result != undefined) {
        req.searchResult = result.rows.map(x => String(x.image));
      } else {
        req.searchResult = "";
      }
      req.searchTerm = searchTerm;
      req.category = category;
      next();
    });
  }
}

express()
  .use(express.static(path.join(__dirname, 'public')))
  .use('/jquery', express.static(__dirname + '/node_modules/jquery/dist/'))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/', (req, res) => res.render('pages/index'))
  .get('/vertical-prototype', search, (req, res) => {
    var searchResult = req.searchResult;
    res.render('pages/vertical-prototype', {
      results: searchResult.length,
      searchTerm: req.searchTerm,
      searchResult: searchResult,
      category: req.category
    });
  })
  .get('/about', (req, res) => res.render('pages/about'))
  .get('/about/ScottPenn', (req, res) => res.render('pages/aboutScott'))
  .get('/about/AnDao', (req, res) => res.render('pages/aboutAn'))
  .get('/about/AndrewAndrawo', (req, res) => res.render('pages/aboutAndrew'))
  .get('/about/AnitaZhen', (req, res) => res.render('pages/aboutAnita'))
  .get('/about/NickStepanov', (req, res) => res.render('pages/aboutNick'))
  .get('/about/BrandonTong', (req, res) => res.render('pages/aboutBrandon'))
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))