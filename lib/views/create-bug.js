'use strict';

var filesize = require('filesize');

var tpl = require('../template.js');
var utils = require('../utils.js');
var conf = require('../config.js');

var form;
var attachments = [];

function value(selector) {
  return document.querySelector(selector).value.trim();
}

function deleteAttachment(e) {
  attachments = attachments.filter(function(file) {
    return file.name !== e.target.dataset.name;
  });
  drawAttachments();
};

function previewAttachment(file) {
  var preview = document.createElement('div');

  preview.classList.add('preview');
  preview.style.backgroundImage =
    'url(data:' + file.type + ';base64,' + file.data + ')';

  preview.addEventListener('click', function() {
    document.body.removeChild(preview);
  });

  document.body.appendChild(preview);
};

function drawAttachments() {
  tpl.read('/views/attachment-row.tpl').then(function(row) {
    var frag = document.createDocumentFragment();
    attachments.map(function(file) {
      var types = ['image/png', 'image/jpg', 'image/jpeg'];
      var dom = row.cloneNode(true);
      var a = dom.querySelector('a');
      var bytes = Math.round((file.data.length - 814) / 1.37);
      // Tiny files will be negative due to approximiating base64
      // compression size
      if (bytes < 0) {
        bytes = 0;
      }
      dom.querySelector('.name').textContent = file.name;
      dom.querySelector('.size').textContent = filesize(bytes);
      a.dataset.name = file.name;
      a.addEventListener('click', deleteAttachment);
      if (types.indexOf(file.type) !== -1) {
        var span = dom.querySelector('span');
        span.classList.add('previewLink');
        span.addEventListener('click', function() {
          previewAttachment(file);
        });
      }
      frag.appendChild(dom);
    });
    form.querySelector('.attachments').innerHTML = '';
    form.querySelector('.attachments').appendChild(frag);
  });
}

// We currently base64 all incoming files as that is what the bmo
// API needs anyway, may want to avoid encoding until they are sent
function inputChanged(e) {
  var files = e.target.files;
  for (var i = 0; i < files.length; i++) {
    var file = files.item(i);
    var reader = new FileReader();
    reader.onload = (function(theFile) {
      return function(e) {
        attachments.push({
          name: theFile.name,
          type: theFile.type,
          data: e.target.result.split(',')[1]
        });
        drawAttachments();
      }
    })(file);
    reader.readAsDataURL(file);
  }
}


function addAttachments(blobs, names) {
  blobs.forEach(function(blob, i) {
    var reader = new window.FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = function() {
      attachments.push({
        name: names[i],
        type: blob.type,
        data: reader.result
      });
      drawAttachments();
    }
  });
}


function formSubmitted(e) {

  e.preventDefault();

  var dialog = utils.dialog('Submitting Bug ...');

  this.app.bugzilla.createBug({
    product: 'Firefox OS',
    component: ((conf.version === 1) ? 'Gaia' : value('#component')),
    op_sys: 'All',
    platform: 'All',
    summary: value('#summary'),
    description: value('#description'),
    version: 'unspecified'
  }).then(function(result) {
    var id = result.id;
    var self = this;
    function createAttachments() {
      if (!attachments.length) {
        dialog.close();
        utils.toaster('Bug Submitted');
        if (conf.version === 1) {
          self.app.page('/create/');
        } else {
          self.app.page('/bug/' + result.id);
        }
        return;
      }
      var file = attachments.pop();
      self.app.bugzilla.createAttachment(id, {
        ids: [id],
        data: file.data,
        file_name: file.name,
        summary: file.name,
        content_type: file.type || 'application/octet-stream'
      }).then(function() {
        createAttachments();
      }).catch(function() {
        console.error('Error writing', file.name);
        createAttachments();
      });
    };
    createAttachments();
  }.bind(this)).catch(function(e) {
    var msg = e.message || 'There was an unknown error';
    utils.alert(msg);
    dialog.close();
  });
}

function CreateBug(app) {
  this.app = app;
};

CreateBug.prototype.render = function(ctx) {
  return tpl.read('/views/create_bug.tpl').then((function(_form) {

    form = _form;

    if (this.app.activity) {
      addAttachments(this.app.activity.data.blobs, this.app.activity.data.filenames);
      this.app.activity = null;
    }

    [].forEach.call(form.querySelectorAll('input[type=file]'), function(file) {
      file.addEventListener('change', inputChanged.bind(this));
    });
    form.addEventListener('submit', formSubmitted.bind(this));

    return form;
  }).bind(this));
};

module.exports = function (app) {
  return new CreateBug(app);
};
