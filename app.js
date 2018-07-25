const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000
const {
  Client
} = require('pg');
const bcrypt = require('bcrypt');
const session = require('express-session')
const formidable = require('formidable')
const sharp = require('sharp')

//Currently the Database credentials are hardcoded. In the future this will be set to the environment variable
//That value is currently incorrect on my computer, leading to errors in local environment testing.
const database = new Client({
  connectionString: 'postgres://rzolioxhicdcbq:2dcdefed515615296c818c19a1bae98a6dac3962ac5de97c5e200deb80539b08@ec2-23-21-166-148.compute-1.amazonaws.com:5432/df31neji5vbebi',
  ssl: true,
});

database.connect();

//The number of search results
var results = 0;

const photoDirectory = path.join(__dirname, 'public/images/StockPhotos');
const thumbnailDirectory = path.join(__dirname, 'public/images/StockPhotos/Thumbnails');


function upload(req, res, next) {
  if (req.session.user === 'guest') {
    console.log(`I'm a guest`);
    next();
  } else {

    database.query('SELECT ID FROM Users WHERE Username = $1', [req.session.user], (err, result) => {
      if (err) {
        console.log(err);
        next();
      }
      var id = String(result.rows[0].id);
      var timestamp = 0;
      var extension = '.jpg'
      var form = new formidable.IncomingForm()
      form.multiples = true
      form.keepExtensions = true
      form.uploadDir = photoDirectory
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.log(err);
          next();
        }
        sharp(path.join(photoDirectory, `${req.session.user}_${timestamp}.${extension}`))
          .resize(100, 100)
          .toFile(path.join(thumbnailDirectory, `${req.session.user}_${timestamp}.${extension}`), (err, info) => {
            if (err) {
              console.log(err);
              next();
            }
            console.log(info);
            database.query('INSERT INTO Posting VALUES(DEFAULT, $1, $2, $3, $4, $5)', ['test', 'Nature', 'Pending', id, `${req.session.user}_${timestamp}.${extension}`], (err, result) => {
              if (err) {
                console.log(err);
                next();
              }

              next();
            });
          });
        console.log('upload succeeded');
      })
      form.on('fileBegin', function(name, file) {
        const [fileName, fileExt] = file.name.split('.')
        timestamp = new Date().getTime();
        extension = fileExt;
        file.path = path.join(photoDirectory, `${req.session.user}_${timestamp}.${fileExt}`);
      });

    });

  }

}

function register(req, res, next) {

  bcrypt.hash(req.body.password, 10, function(err, hash) {
    database.query('INSERT INTO Users VALUES(DEFAULT, $1, $2, $3, $4, ARRAY[]::int[])', [req.body.username, req.body.email, hash, 'user'], (err, result) => {
      if (err) {
        console.log(err);
        next();
      }

      login(req, res, next);
      next();
    });
  });
}

function login(req, res, next) {


  database.query('SELECT Username, Password FROM Users WHERE Username = $1', [req.body.username], (err, result) => {
    if (err) {
      console.log(err);
      res.locals = {
        user: 'guest'
      };
      next();
    }

    if (result.rows.length == 1) {
      bcrypt.compare(req.body.password, String(result.rows[0].password), function(err, res) {
        if (res) {
          req.session.user = String(result.rows[0].username);
          res.locals = {
            user: req.session.user
          };
        }
        next();
      });
    } else {
      //TODO: Show error to user, no username exists
      next();
    }
  });
}

function logout(req, res, next) {
  req.session.user = 'guest';
  res.locals = {
    user: req.session.user
  };
  next();
}

function validateUser(req, res, next) {
  if (!req.session.user) {
    req.session.user = 'guest'
  }
  res.locals = {
    user: req.session.user
  };

  next();
}

// This function is an intermediate function that passes the results of a database query
// to the renderer. Currently it checks if the category is valid, then runs a query depending
// on the result. In the future, we plan on handling the errors in a better way than ignoring them.
function search(req, res, next) {
  //The user's search term
  var searchTerm = req.query.search;
  //The user's selected category
  var category = req.query.category;

  if (category === undefined || category === "") {
    database.query('SELECT Image FROM Posting WHERE Name ~~* $1', ['%' + searchTerm + '%'], (err, result) => {
      if (err) {
        req.searchResult = "";
        req.searchTerm = "";
        req.category = "";
        next();
      }

      //The results are parsed as JSON into the image column String that points to a file.
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
  .use(session({
    secret: 'csc648-stock-overflow',
    resave: false,
    saveUninitialized: true
  }))
  .use(validateUser)
  .use(express.static(path.join(__dirname, 'public')))
  .use('/jquery', express.static(__dirname + '/node_modules/jquery/dist/'))
  .use(express.urlencoded())
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/', search, (req, res) => {

    //It is here that we pass the results of the query to the renderer.
    //The page will dynamically load data based on the results.
    var searchResult = req.searchResult;
    res.render('pages/index', {
      results: searchResult.length,
      searchTerm: req.searchTerm,
      searchResult: searchResult,
      category: req.category
    });
  })
  .get('/login', (req, res) => res.render('pages/login'))
  .post('/login', login, (req, res) => {
    res.redirect('/');
  })
  .get('/logout', logout, (req, res) => res.redirect('/'))
  .get('/register', (req, res) => res.render('pages/register'))
  .post('/register', register, (req, res) => {
    res.redirect('/');
  })
  .get('/vertical-prototype', search, (req, res) => {

    //It is here that we pass the results of the query to the renderer.
    //The page will dynamically load data based on the results.
    var searchResult = req.searchResult;
    res.render('pages/vertical-prototype', {
      results: searchResult.length,
      searchTerm: req.searchTerm,
      searchResult: searchResult,
      category: req.category
    });
  })
  .get('/upload', (req, res) => res.render('pages/upload'))
  .post('/upload', upload, (req, res) => {
    if (req.session.user == 'guest') {
      res.redirect('/login');
    } else {
      res.redirect('back');
    }
  })
  .get('/about', (req, res) => res.render('pages/about'))
  .get('/about/ScottPenn', (req, res) => res.render('pages/aboutScott'))
  .get('/about/AnDao', (req, res) => res.render('pages/aboutAn'))
  .get('/about/AndrewAndrawo', (req, res) => res.render('pages/aboutAndrew'))
  .get('/about/AnitaZhen', (req, res) => res.render('pages/aboutAnita'))
  .get('/about/NickStepanov', (req, res) => res.render('pages/aboutNick'))
  .get('/about/BrandonTong', (req, res) => res.render('pages/aboutBrandon'))
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))