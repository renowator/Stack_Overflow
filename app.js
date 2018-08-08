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

// this function will display all of the images in the Database for admin page
function displayAll(req, res, next){
  database.query('SELECT * FROM Posting ORDER BY Status, Category DESC', (err, result) => {
    if (err) {
      console.log(err);
      next();
    }
    req.photoID = result.rows.map(x => String(x.id));
    req.image = result.rows.map(x => String(x.image));
    req.imageDescription = result.rows.map(x => String(x.name));
    req.imageStatus = result.rows.map(x => String(x.status));
    req.imageCategory = result.rows.map(x => String(x.category));
    req.results = result.rows.length;
    next();

  });
}

function display(req, res, next) {
  database.query('SELECT Image, Name FROM Posting WHERE ID = $1', [req.params.id], (err, result) => {
    if (err) {
      console.log(err);
      next();
    }

    req.imageName = String(result.rows[0].image)
    req.imageDescription = String(result.rows[0].name)
    next();

  });
}

function upload(req, res, next) {
  if (req.session.user === 'guest') {
    console.log(`I'm a guest`);
    next();
  } else {
    var timestamp = 0; //defaults
    var extension = '.jpg' //defaults
    var description = 'No description given'
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
          database.query('INSERT INTO Posting VALUES(DEFAULT, $1, $2, $3, $4, $5)', [description, 'Nature', 'Pending', req.session.userid, `${req.session.user}_${timestamp}.${extension}`], (err, result) => {
            if (err) {
              console.log(err);
              next();
            }

            next();
          });
        });
      console.log('upload succeeded');
    })
    form.on('field', function(name, value) {
      description = value
    });
    form.on('fileBegin', function(name, file) {
      const [fileName, fileExt] = file.name.split('.')
      timestamp = new Date().getTime();
      extension = fileExt;
      file.path = path.join(photoDirectory, `${req.session.user}_${timestamp}.${fileExt}`);
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
    });
  });
}

function login(req, res, next) {


  database.query('SELECT ID, Username, Password FROM Users WHERE Username = $1', [req.body.username], (err, result) => {
    if (err) {
      console.log(err);
      res.locals = {
        user: 'guest',
        id: 1
      };
      next();
    }

    if (result.rows.length == 1) {
      bcrypt.compare(req.body.password, String(result.rows[0].password), function(err, res) {
        if (res) {
          req.session.user = String(result.rows[0].username);
          req.session.userid = String(result.rows[0].id);
          res.locals = {
            user: req.session.user,
            id: req.session.userid
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
  req.session.userid = 1;
  res.locals = {
    user: req.session.user,
    id: req.session.userid
  };
  next();
}

function validateAdmin(req, res, next){

}

function validateUser(req, res, next) {
  if (!req.session.user) {
    req.session.user = 'guest'
    req.session.userid = 1
  }
  res.locals = {
    user: req.session.user,
    id: req.session.userid
  };

  next();
}

function validate(req, res, next) {
  req.hasSearched = true
  req.isValid = false;
  req.message = "";
  var searchTerm = req.query.search;
  if (searchTerm == undefined) {
    searchTerm = "";
    req.hasSearched = false;
  }

  if (searchTerm.length > 50) {
    req.message = "Search term must be no more than 50 characters long. Please search again with a shorter query.";
    req.isValid = false;
    next();
  }

  var pattern = /^[0-9a-zA-Z\s]*$/;
  if (!searchTerm.match(pattern)) {
    req.message = "Search term must contain only alphanumeric characters or spaces. Please search again with a valid query.";
    req.isValid = false;
    next();
  }

  req.isValid = true;
  next();
}

// This function is an intermediate function that passes the results of a database query
// to the renderer. Currently it checks if the category is valid, then runs a query depending
// on the result. In the future, we plan on handling the errors in a better way than ignoring them.
function search(req, res, next) {

  if (!req.isValid) {
    req.searchResult = "";
    req.searchTerm = "";
    req.category = "";
    next();
  }


  //The user's search term
  var searchTerm = req.query.search;
  //The user's selected category
  var category = req.query.category;

  if (category === undefined || category === "") {
    database.query('SELECT Image, ID FROM Posting WHERE Name ~~* $1', ['%' + searchTerm + '%'], (err, result) => {
      if (err) {
        req.searchResult = "";
        req.searchTerm = "";
        req.category = "";
        next();
      }

      //The results are parsed as JSON into the image column String that points to a file.
      req.searchResult = result.rows.map(x => String(x.image));
      req.photoID = result.rows.map(x => String(x.id));
      req.searchTerm = searchTerm;
      req.category = "";
      next();
    });
  } else {
    database.query('SELECT Image, ID FROM Posting WHERE Category = $1 AND Name ~~* $2', [category, '%' + searchTerm + '%'], (err, result) => {
      if (err) {
        req.searchResult = "";
        req.searchTerm = "";
        req.category = "";
        console.log(err, "search second query")
        next();
      }

      if (result != undefined) {
        req.searchResult = result.rows.map(x => String(x.image));
        req.photoID = result.rows.map(x => String(x.id));
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
  .get('/', validate, search, (req, res) => {

    //It is here that we pass the results of the query to the renderer.
    //The page will dynamically load data based on the results.
    var searchResult = req.searchResult;
    if (!req.photoID) {
      req.photoID = 1
    }
    if (!req.hasSearched) {
      req.searchTerm = undefined;
    }
    res.render('pages/index', {
      results: searchResult.length,
      searchTerm: req.searchTerm,
      searchResult: searchResult,
      photoID: req.photoID,
      category: req.category,
      message: req.message
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
    if (!req.photoID) {
      req.photoID = 1
    }
    res.render('pages/vertical-prototype', {
      results: searchResult.length,
      searchTerm: req.searchTerm,
      searchResult: searchResult,
      photoID: req.photoID,
      category: req.category
    });
  })
  .get('/display/:id', display, (req, res) => {
    res.render('pages/display', {
      fileName: req.imageName,
      description: req.imageDescription
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
  .get('/admin', displayAll , (req, res) => {
    res.render('pages/admin', {
      results: req.results, // number of pictures
      image: req.image,
      description: req.imageDescription,
      status:req.imageStatus,
      photoID: req.photoID,
      category: req.imageCategory
    });
  })
  .post('/admin', displayAll, (req, res) =>{

    var id = req.body.status.toString();
    var splitID = id.split(".")
    var imgID = splitID[0];
    var imgStatus = splitID[1];

    database.query('UPDATE Posting SET Status = ($1) WHERE ID = ($2)', [imgStatus, imgID]);
    res.render('pages/admin', {
      results: req.results, // number of pictures
      image: req.image,
      description: req.imageDescription,
      status:req.imageStatus,
      photoID: req.photoID,
      category: req.imageCategory
    });
  })
  .post('/admin')
  .get('/about/ScottPenn', (req, res) => res.render('pages/aboutScott'))
  .get('/about/AnDao', (req, res) => res.render('pages/aboutAn'))
  .get('/about/AndrewAndrawo', (req, res) => res.render('pages/aboutAndrew'))
  .get('/about/AnitaZhen', (req, res) => res.render('pages/aboutAnita'))
  .get('/about/NickStepanov', (req, res) => res.render('pages/aboutNick'))
  .get('/about/BrandonTong', (req, res) => res.render('pages/aboutBrandon'))
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))
