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

function display(req, res, next) {
  database.query('SELECT * FROM Posting WHERE ID = $1', [req.params.id], (err, result) => {
    if (err) {
      console.log(err);
      next();
    }

    req.image = String(result.rows[0].image)
    req.imageName = String(result.rows[0].name)
    req.imageDescription = String(result.rows[0].description)
    req.imageCategory = String(result.rows[0].category)

    //TODO get image uploader.
    next();

  });
}

// function downloadPhoto(req, res, next) {
//   var photo = path.join(photoDirectory, req.body.fileName);
//   res.download(photo);
//   next();
// }

function upload(req, res, next) {
  if (req.session.user === 'guest') {
    console.log(`I'm a guest`);
    next();
  } else {
    var timestamp = 0; //defaults
    var extension = '.jpg' //defaults
    var imageName = ''
    var imageDescription = 'No description given'
    var imageCategory = 'None'
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
          database.query('INSERT INTO Posting VALUES(DEFAULT, $1, $2, $3, $4, $5, $6) RETURNING ID;', [imageName, imageDescription, imageCategory, 'Pending', req.session.userid, `${req.session.user}_${timestamp}.${extension}`], (err, result) => {
            if (err) {
              console.log(err);
              next();
            }
            console.log(result);
            database.query('UPDATE Users SET Postings = Postings || $1 WHERE ID = $2', [`{${result.rows[0].id}}`, req.session.userid], (err, result) => {
              if (err) {
                console.log(err);
                next();
              }

              next();
            });
          });
        });
      console.log('upload succeeded');
    })
    form.on('field', function(name, value) {
      switch (name) {
        case "imageName":
          imageName = value;
          break;
        case "imageDescription":
          if (value != "") {
            imageDescription = value;
          }
          break;
        case "category":
          imageCategory = value;
          break;
        default:
          break;
      }
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

function validateLogin(req, res, next) {
  console.log("validating login")
  var valid = "is-valid";
  var invalid = "is-invalid";

  req.usernameMessage = "";
  req.passwordMessage = "";
  //Validate Username
  if (req.body.username == "") {
    req.usernameValid = invalid;
    req.usernameMessage = "Username is a required field.";
  } else if (req.body.username.length >= 40) {
    req.usernameValid = invalid;
    req.usernameMessage = "Username must be no more than 40 characters long.";
  } else if (!req.body.username.match(/^[a-zA-Z0-9]+$/)) {
    req.usernameValid = invalid;
    req.usernameMessage = "Username must contain only alphanumeric characters.";
  } else {
    req.usernameValid = valid;
  }

  //Validate Password
  if (req.body.password == "") {
    req.passwordValid = invalid;
    req.passwordMessage = "Password is a required field.";
  } else if (req.body.password.length >= 40) {
    req.passwordValid = invalid;
    req.passwordMessage = "Password must be no more than 40 characters long.";
  } else {
    req.passwordValid = valid;
  }

  req.loginValid = req.usernameValid == valid && req.passwordValid == valid;
  next();
}

function login(req, res, next) {

  if (!req.loginValid) {next();}

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

// This function is called before search to validate the input. 
// Currently there are two conditions, that the search term contains only alphanumeric characters,
// and that the search term is 50 characters or fewer.
// If invalid, the search does not complete and an error message is passed to the search result page.
function validateSearch(req, res, next) {
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
      if (result != undefined) {
        req.searchResult = result.rows.map(x => String(x.image));
        req.photoID = result.rows.map(x => String(x.id));
      } else {
        req.searchResult = "";
      }
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
  .use(express.urlencoded({
    extended: false
  }))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/', validateSearch, search, (req, res) => {

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
  .get('/login', (req, res) => res.render('pages/login', {
        usernameMessage : req.usernameMessage,
        passwordMessage : req.passwordMessage,
        usernameValid : req.usernameValid,
        passwordValid : req.passwordValid,
        username : ""
  }))
  .post('/login', validateLogin, login, (req, res) => {
    if (res.loginValid) {
      res.redirect('/');
    } else {
      console.log(req.usernameMessage, req.passwordMessage);
      if (req.passwordValid == "is-valid") {req.passwordValid = "";}
      res.render('pages/login', {
        usernameMessage : req.usernameMessage,
        usernameValid : req.usernameValid,
        username : req.body.username,
        passwordMessage : req.passwordMessage,
        passwordValid   : req.passwordValid
      });
    }
  })
  .get('/logout', logout, (req, res) => res.redirect('/'))
  .get('/register', (req, res) => res.render('pages/register'))
  .post('/register', register, (req, res) => {
    res.redirect('/');
  })
  .get('/display/:id', display, (req, res) => {
    res.render('pages/display', {
      fileName: req.image,
      name: req.imageName,
      description: req.imageDescription,
      category: req.imageCategory
    });
  })
  .post('/display/:id', (req, res) => {
    var photo = path.join(photoDirectory, req.body.fileName);
    var extension = photo.split('.').pop()
    res.download(photo, `StockOverflow-${req.params.id}.${extension}`);
  })
  .get('/upload', (req, res) => res.render('pages/upload'))
  .post('/upload', upload, (req, res) => {
    if (req.session.user == 'guest') {
      res.redirect('/login');
    } else {
      res.redirect('/upload');
    }
  })
  .get('/about', (req, res) => res.render('pages/about'))
  .get('/admin', (req, res) => res.render('pages/admin'))
  .get('/password-reset', (req, res) => res.render('pages/password'))
  .get('/about/ScottPenn', (req, res) => res.render('pages/aboutScott'))
  .get('/about/AnDao', (req, res) => res.render('pages/aboutAn'))
  .get('/about/AndrewAndrawo', (req, res) => res.render('pages/aboutAndrew'))
  .get('/about/AnitaZhen', (req, res) => res.render('pages/aboutAnita'))
  .get('/about/NickStepanov', (req, res) => res.render('pages/aboutNick'))
  .get('/about/BrandonTong', (req, res) => res.render('pages/aboutBrandon'))
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))

// .get('/vertical-prototype', search, (req, res) => {

//   //It is here that we pass the results of the query to the renderer.
//   //The page will dynamically load data based on the results.
//   var searchResult = req.searchResult;
//   if (!req.photoID) {
//     req.photoID = 1
//   }
//   res.render('pages/vertical-prototype', {
//     results: searchResult.length,
//     searchTerm: req.searchTerm,
//     searchResult: searchResult,
//     photoID: req.photoID,
//     category: req.category
//   });
// })