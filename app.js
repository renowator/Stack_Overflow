const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000
const { Client } = require('pg');

const database = new Client ({
  connectionString: 'postgres://rzolioxhicdcbq:2dcdefed515615296c818c19a1bae98a6dac3962ac5de97c5e200deb80539b08@ec2-23-21-166-148.compute-1.amazonaws.com:5432/df31neji5vbebi',
  ssl: true,
});

database.connect();

database.query(`SELECT * FROM Posting WHERE Name ~~* '%T%'`, (err, res) => {

  if (err) {
    throw err;
  }
  for (let row of res.rows) {
    //console.log(JSON.stringify(row));
  }
});

console.log("hello")
var results = 0;

function search(req, res, next) {
  var searchTerm = req.query.search;
  
  database.query('SELECT Image FROM Posting WHERE Name ~~* $1', ['%' + searchTerm + '%'], (error, result) => {
    if (error) {
      console.log(error)
      throw error;
    }

    req.searchResult = result.rows.map(x => String(x.image));
    req.searchTerm = searchTerm;
    console.log(searchTerm)
    next();
  });
}

express()
  .use(express.static(path.join(__dirname, 'public')))
  .use('/jquery', express.static(__dirname + '/node_modules/jquery/dist/'))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/', (req, res) => res.render('pages/index'))
  .get('/vertical-prototype', search, (req, res) => {
      searchResult = req.searchResult;
      res.render('pages/vertical-prototype', {results : searchResult.length, searchTerm : req.searchTerm, searchResult: searchResult});
    })
  .get('/about', (req, res) => res.render('pages/about'))
  .get('/about/ScottPenn', (req, res) => res.render('pages/aboutScott'))
  .get('/about/AnDao', (req, res) => res.render('pages/aboutAn'))
  .get('/about/AndrewAndrawo', (req, res) => res.render('pages/aboutAndrew'))
  .get('/about/AnitaZhen', (req, res) => res.render('pages/aboutAnita'))
  .get('/about/NickStepanov', (req, res) => res.render('pages/aboutNick'))
  .get('/about/BrandonTong', (req, res) => res.render('pages/aboutBrandon'))
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))
