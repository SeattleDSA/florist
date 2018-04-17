/* global XLSX btoa nacl saveAs Blob zxcvbn surpass */
(function(){
"use strict";

function getArrayBufferFromFile(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      return resolve(new Uint8Array(e.target.result));
    };
    reader.readAsArrayBuffer(file);
  });
}

function xlsxBufferToUglyMemberList(buffer) {
  var membershipWorkbook = XLSX.read(buffer, {type: 'array'});
  return XLSX.utils.sheet_to_json(
    membershipWorkbook.Sheets[membershipWorkbook.SheetNames[0]]);
}

var nameFields = ['first_name', 'middle_name', 'last_name', 'suffix',
  'family_first_name', 'family_last_name'];

function monthName(date) {
  return ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ][new Date(date || Date.now()).getMonth()];
}

function currentYear(date) {
  return new Date().getFullYear().toString();
}

function isoDate(date) {
  return new Date(date || Date.now()).toISOString().slice(0,10);
}

function uglyMemberObjectToMeetingMemberObject(ugly) {
  var nameParts = [];

  // add each present name component, in order
  for (var i = 0; i < nameFields.length; ++i) {
    if (/\S/.test(ugly[nameFields[i]] || '')) {
      nameParts.push(ugly[nameFields[i]].trim());
    }
  }

  return {
    id: ugly.AK_id,
    name: nameParts.join(' '),
    expiry: isoDate(ugly.Xdate)
  };
}

function uglyMemberListToMeetingMemberList(uglyList) {
  return uglyList.map(uglyMemberObjectToMeetingMemberObject);
}

function xlsxBufferToMeetingMemberList(xlsxBuffer) {
  return uglyMemberListToMeetingMemberList(
    xlsxBufferToUglyMemberList(xlsxBuffer));
}

// remorselessly copied from https://github.com/dchest/tweetnacl-util-js/blob/master/nacl-util.js
function utf8StringToArrayBuffer (s) {
  if (typeof s !== 'string') throw new TypeError('expected string');
  var i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
  for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
  return b;
};

function objectToJsonArrayBuffer(obj) {
  return utf8StringToArrayBuffer(JSON.stringify(obj));
}

var formElement = document.getElementById('form');
var eventNameInput = document.getElementById('event-name');
var xlsxFileInput = document.getElementById('xlsx-file');
var passphraseInput = document.getElementById('passphrase');
var strengthBar = document.getElementById('strength');
var downloadButton = document.getElementById('dl-button');

eventNameInput.value = monthName() + ' ' + currentYear() + ' General Meeting';
surpass(passphraseInput, {double: true});

var strengthBarBaseClass = "";
var strengthBarAdequateClass = "success";
var strengthBarInadequateClass = "error";

// min log10 guesses necessary to require "centuries" for a fast parallel hash
var adequateZxcvbnScore = 20;
strengthBar.max = adequateZxcvbnScore;

function updateButtonState() {
  var zxcvbnScore = zxcvbn(passphraseInput.value).guesses_log10;
  var passphraseIsAdequate = zxcvbnScore >= adequateZxcvbnScore;

  strengthBar.value = zxcvbnScore;
  strengthBar.className =
    strengthBarBaseClass + (passphraseIsAdequate ?
      strengthBarAdequateClass : strengthBarInadequateClass);

  downloadButton.disabled = !(
    xlsxFileInput.files[0] && passphraseInput.value && passphraseIsAdequate);
}

function createEventExportForMemberList(memberList) {
  return {
    name: eventNameInput.value,
    created: new Date().toISOString(),
    members: memberList
  };
}

function defaultDatabaseFilename() {
  return eventNameInput.value.toLowerCase()
    .replace(/\s+/g,'-').replace(/\W+/g,'') + '_memberlist.json.sbox';
}

function downloadEncryptedDatabase() {
  getArrayBufferFromFile(xlsxFileInput.files[0])
    .then(xlsxBufferToMeetingMemberList)
    .then(createEventExportForMemberList)
    .then(objectToJsonArrayBuffer)
    .then(function(memberListBuffer) {
      var passphraseHashData = nacl.hash(
        utf8StringToArrayBuffer(passphraseInput.value));
      var secretKey = passphraseHashData.slice(0, nacl.secretbox.keyLength);
      var secretNonce = passphraseHashData.slice(nacl.secretbox.keyLength,
        nacl.secretbox.keyLength + nacl.secretbox.nonceLength);
      var encryptedBlob = new Blob([
        nacl.secretbox(memberListBuffer, secretNonce, secretKey)],
        {type:'application/octet-stream'});
      saveAs(encryptedBlob, defaultDatabaseFilename(), true);
    });
}

xlsxFileInput.addEventListener('change', updateButtonState);
passphraseInput.addEventListener('input', updateButtonState);
formElement.addEventListener('submit', function (evt) {
  evt.preventDefault();
  return downloadEncryptedDatabase();
});

})();
