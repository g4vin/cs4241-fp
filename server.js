var http = require('http'),
    fs = require('fs'),
    url = require('url'),
    port = 8080,
    qs = require('querystring');

var config = require('./config')
var mysql = require('mysql');
var validUrl = require('valid-url');
var https = require('https');

var pageProcessor = require('./pageProcessor.js');
var pageProcessorInstance = new pageProcessor();


//INCOMING REQUESTS
var server = http.createServer(function(req, res) {
    var uri = url.parse(req.url, true)
        //POST Requests
    if (req.method == 'POST') {
        var body = '';

        req.on('data', function(data) {
            body += data;

            //1MB max request size
            if (body.length > 1e6)
                req.connection.destroy();
        });


        switch (uri.pathname) {
            case '/grade':
                var func = function() {
                    handleGrade(body, res)
                }
                req.on('end', func)
                break
            default:
                sendWebpage('404 File Not Found', res, 404)
        }


    } else {
        //Get Requests
        switch (uri.pathname) {
            case '/':
                handleIndex(res)
                break
            case '/page':
                handleID(res, uri)
                break
            case '/content':
                handleContent(res, uri)
                break
            case '/index.html': //incase a webbrowser requests the site by this
                handleIndex(res)
                break
            case '/framefail.html': //backup for iframe
                sendFile(res, 'framefail.html', 'text/html')
                break
            case '/style.css':
                sendFile(res, 'style.css', 'text/css')
                break
            case '/js/scripts.js':
                sendFile(res, 'js/scripts.js', 'text/javascript')
                break
            case '/js/datavis.js':
                sendFile(res, 'js/datavis.js', 'text/javascript')
                break
            case '/js/d3.min.js':
                sendFile(res, 'js/d3.min.js', 'text/javascript')
                break
            case '/README.md':
                sendFile(res, 'README.md', 'text/plain')
                break

            default:
                sendWebpage('404 File Not Found', res, 404, null, true)
        }
    }



})

server.listen(process.env.PORT || port)
console.log('listening on 8080')

function handleID(res, uri) {
    if (uri.query && (uri.query.id !== "")) {
        console.log(uri.query)

        //open db connection
        var connection = mysql.createConnection(config.database)
        connection.connect();

        var id = mysql.escape(uri.query.id)

        var aPage = new Page(undefined, undefined, id, connection, res)


    } else {
        sendWebpage('404 File Not Found', res, 404, true)
    }
}

function handleContent(res, uri){
    if (uri.query && (uri.query.id !== "")) {
        console.log(uri.query)

        //open db connection
        var connection = mysql.createConnection(config.database)
        connection.connect();

        var id = mysql.escape(uri.query.id)

        var aPage = new Page(undefined, undefined, undefined, connection, res, id)


    } else {
        sendWebpage('404 File Not Found', res, 404)
    }
}

function handleGrade(body, res) {
    var post = qs.parse(body);
    var url = post['url']
    var text = post['text']


    //open db connection
    var connection = mysql.createConnection(config.database)
    connection.connect();

    var aPage = new Page(url, text, '', connection, res)


};

//Page class
function Page(__url, __text, __id, __connection, __res, __content) {
    var self = this //I've had enough of this

    self.url = __url
    self.text = __text
    self.connection = __connection
    self.res = __res
    self.data = ''
    self.htmlLocation = ''
    self.id = -1
    self.tags = null

    //Determine submitted type
    if (self.url) {
        self.processUrl()
    } else if (self.text) {
        self.data = self.text
        self.processText()
    } else if (__id) {
        self.processRequest(__id)
    } else if(__content){
        self.processDataRequest(__content)
    }
}

Page.prototype.processText = function() {
    var self = this
    self.htmlLocation = 'Pasted HTML'
    pageProcessorInstance.processText(self.update, self)
};

Page.prototype.processUrl = function() {
    var self = this

    //Determine if url is in database
    self.htmlLocation = mysql.escape(self.url)

    var query = 'SELECT * FROM `pages` WHERE `location` = "' + self.htmlLocation + '"'
    console.log('processUrl: ' + query)

    this.connection.query(query, function(err, rows, fields) {
        if (err) throw err;

        if (rows.length >= 1) {
            self.id = rows[0].ID

            self.data = rows[0].html
            self.tags = JSON.parse(rows[0].json_tags)
            sendWebpage(self.toHTML(), self.res, 200, self.connection)
        } else {
            performWebLookup();
        }
    });


    //Download the page and parse it
    function performWebLookup() {

        if (validUrl.isUri(self.url)) {

            //determine type
            var protocol = self.url.substring(0,5)
            if(protocol === 'https'){
                 https.get(self.url, function(response) {
                pageProcessorInstance.process(response, self.update, self)
            })
            }
            else{
            http.get(self.url, function(response) {

                pageProcessorInstance.process(response, self.update, self)
            })
        }
            console.log('made request')
        } else {
            console.log('Not a URI');
            self.data = rows[0].html
            self.tags = JSON.parse(rows[0].json_tags)
            sendWebpage('<h1>Not a Uri</h1>', self.res, 503, self.connection)
        }
    }

}; //processUrl

Page.prototype.processRequest = function(id) {
    var self = this

    var query = 'SELECT * FROM `pages` WHERE `ID` = ' + id
    console.log('processRequest: ' + query)

    self.connection.query(query, function(err, rows, fields) {
        if (err) throw err;

        if (rows.length >= 1) {
            self.htmlLocation = rows[0].location
            self.id = rows[0].ID
            self.data = rows[0].html
            self.tags = JSON.parse(rows[0].json_tags)
            sendWebpage(self.toHTML(), self.res, 200, self.connection)
        } else {
            //close db
            sendWebpage('404 File Not Found', self.res, 404, self.connection, true)

        }
    });

};

Page.prototype.processDataRequest = function(id) {
    var self = this

    var query = 'SELECT * FROM `pages` WHERE `ID` = ' + id
    console.log('processRequest: ' + query)

    self.connection.query(query, function(err, rows, fields) {
        if (err) throw err;

        if (rows.length >= 1) {
            self.htmlLocation = rows[0].location
            self.id = rows[0].ID
            self.data = rows[0].html
            self.tags = JSON.parse(rows[0].json_tags)
            sendWebpage(self.data, self.res, 200, self.connection, true)
        } else {
            //close db
            sendWebpage('404 File Not Found', self.res, 404, self.connection, true)

        }
    });

};

Page.prototype.toHTML = function() {
    var self = this;

    var html = ''
    html += '<h2>Source: ' + self.htmlLocation + '</h2>'

    //permalink
    html += '<a href="'
    html += 'page?id=' + self.id
    html += '">Permalink' + '</a>'

   /* //Build table
    html += '<table><tr><th>Tag</th><th>Count</th></tr>'
    for (var counter in self.tags) {
        html += '<tr><td>' + self.tags[counter].name + ' </td>'
        html += '<td>' + self.tags[counter].count + '<td></tr>'
    }
    html += '</table>'*/

    html += '<div class="chart" id="chart">'
    for (var counter in self.tags) {
        html += '<p class="bardata">' + self.tags[counter].name + ' ' + self.tags[counter].count + '</p>'
    }
    html += '</div>'

    //Display source code
    html += '<div><h3>Source</h3>'
    html += '<textarea id="srccode" readonly>'
    html += self.data
    html += '</textarea></div>'

    //Display a preview of the page
    html += '<div class="pagepreview"><h3>Preview</h3>'
    html += '<iframe id="preview" src="content?id=' + self.id +  '" frameborder="0" scrolling="no">'
    html += 'Error loading html content'
    html += '</iframe></div>'

    return html;
}; //toHTML



//Inserts new rows and updates existing with new information
Page.prototype.update = function(obj, context) {
    if (!context) {
        var self = this;
    } else {
        var self = context;
    }

    var safe_obj_str = JSON.stringify(obj)
    var page = {
        location: self.htmlLocation,
        html: self.data,
        json_tags: safe_obj_str
    };
    var pageUpdate = {
        html: self.data,
        json_tags: safe_obj_str
    };

    var addAndUpdateQuery = 'INSERT INTO pages SET ? ON DUPLICATE KEY UPDATE ?'

    console.log('update: ' + addAndUpdateQuery)
    self.connection.query(addAndUpdateQuery, [page, pageUpdate], function(err, result) {
        if (err) throw err;

        console.log(result)
        self.id = result.insertId
        self.tags = obj
        sendWebpage(self.toHTML(), self.res, 200, self.connection)
    });


}

function sendWebpage(content_html, res, code, connection, dataOnly) {
    //close db
    if (connection) {
        console.log('sendWebpage has connection')
        connection.end()
    }

    var html = ''
    if(!dataOnly){
    //Top of page
    html = printHTMLStart()
    }
    //content
    html += content_html

    if(!dataOnly){
    //Bottom of page
    html += printHTMLEnd()
    }

    //WriteHeadder
    var contentType = 'text/html'
    if (!code) {
        code = 200
    }
    console.log('return code is ' + code)
    res.writeHead(code, {
        'Content-type': contentType
    })

    res.end(html, 'utf-8')
};




function printHTMLStart() {
    var html = ''
    html += '<html>'
    html += '<head>'
    html += ' <title>CS4241 Final Project - Gavin Hayes and Nick Chaput</title> <meta charset="utf-8"> <link rel="stylesheet" type="text/css" href="style.css"/>'
    html += '<link href="https://fonts.googleapis.com/css?family=Montserrat" rel="stylesheet">'
    html += '</head>'

    html += '<body>'
    html += '<div class = "content">'
    html += '<h1>HTML Stats</h1>'

    html += '<div id="inputSection">'
    html += '<h2>Enter a URL</h2>'
    html += '<form action="grade" method="post">'
    html += '<input type="text" name="url" id="insertbox" autocomplete="off"/></td><td>'
    html += '<h2>or paste your html here</h2>'
    html += '<textarea name="text" id="inputcode"></textarea>'
    html += '<br>'
    html += '<button type="submit">Process</button>'
    html += '</form>'
    html += '</div>'

    html += '<div id="results">'
    return html
};

function printHTMLEnd() {
    var html = '</div>'
    html +=    '<footer>A final project for CS4241 by Gavin Hayes and Nick Chaput <a href="https://github.com/g4vin/cs4241-fp">Github</a></footer>'
    html +=    '</div>'

    html += '<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.12.4/jquery.min.js"></script>'
    html += '<script src="js/scripts.js"></script>'
    html += '<script type="text/javascript" src="js/d3.min.js"></script>'
    html += '<script type="text/javascript" src="js/datavis.js"></script>'
    html += '</body>'
    html += '</html>'

    return html

};

function handleIndex(res) {
    //html += '<iframe src="https://docs.google.com/document/d/1cxTkJFr-B7OU0awR64GOLbRcYTjrzG91dbKz3zz62ik/pub?embedded=true"></iframe>'

    //open db connection
    var connection = mysql.createConnection(config.database)
    connection.connect();

    var aPage = new Page('http://computoid.com', '', '', connection, res)

};

function sendFile(res, filename, contentType) {
    contentType = contentType || 'text/html'

    fs.readFile(filename, function(error, content) {
        res.writeHead(200, {
            'Content-type': contentType
        })
        res.end(content, 'utf-8')
    })

};
