/* global Fuse nacl localforage Blob saveAs surpass */
(function(){
"use strict";

var memberList;

var fuse;

var operator;
var topMember;

var checkinRecord;
var checkinRecordId = 'storedCheckinRecord';

var modeContainers = {
  setup: document.getElementById('setup-mode'),
  signin: document.getElementById('signin-mode'),
  end: document.getElementById('end-mode'),
  lateEnd: document.getElementById('late-end-mode')
};
var currentModeContainer = modeContainers.setup;

function changeMode(mode) {
  currentModeContainer.hidden = true;
  currentModeContainer = modeContainers[mode];
  currentModeContainer.hidden = false;
}

function lastEventIndexOfType(eventType) {
  for (var i = checkinRecord.events.length - 1; i > -1; --i) {
    if (checkinRecord.events[i].type == eventType) return i;
  }
  return -1;
}

function lastEventIndexOfTypeForMember(eventType, memberId) {
  for (var i = checkinRecord.events.length - 1; i > -1; --i) {
    if (checkinRecord.events[i].type == eventType &&
      checkinRecord.events[i].member == memberId) return i;
  }
  return -1;
}

var finalJsonTextarea = document.getElementById('final-json');

function teardownAndEnd() {
  // Wipe dangling pointers to sensitive data
  memberList = null;
  fuse = null;
  // Wipe these too, just for good measure
  operator = null;
  topMember = null;
  // write out our fallback / inspection stuff
  finalJsonTextarea.value = JSON.stringify(checkinRecord, null, 2);
  changeMode('end');
}

function startNewCheckinRecord () {
  checkinRecord = {
    at: '',
    events: []
  };
}

function initializeCheckinRecord(existingRecord) {
  if (existingRecord) {
    checkinRecord = existingRecord;
    var lastOpenIndex = lastEventIndexOfType('open');
    var lastCloseIndex = lastEventIndexOfType('close');
    if (lastCloseIndex > lastOpenIndex) {
      var msSinceLastClose =
        Date.now() - new Date(checkinRecord.events[lastCloseIndex].date);
      if (msSinceLastClose - 86400000) {
        teardownAndEnd();
      } else {
        changeMode('lateEnd');
      }
    } else {
      // TODO: display note that there is an unfinished meeting in progress

      // Signal to load operator after setup
      operator = checkinRecord.events[lastOpenIndex].operator;
    }
  } else {
    startNewCheckinRecord();
  }
}

var recordInitializedPromise =
  localforage.getItem(checkinRecordId).then(initializeCheckinRecord);


function logErrorAndResolve(err) {
  console.error(err);
}

var pendingRecordPersistence = null;
var pendingRecordPersistenceIsStale = false;
function registerEvent(evt) {
  if (!evt.date) {
    throw new Error('Registered events must be pre-dated');
  }
  function repeatOrComplete() {
    if (pendingRecordPersistenceIsStale) {
      pendingRecordPersistenceIsStale = false;
      return persistRecord();
    } else {
      return pendingRecordPersistence = null;
    }
  }

  function persistRecord() {
    return localforage.setItem(checkinRecordId, checkinRecord)
      .catch(logErrorAndResolve).then(repeatOrComplete);
  }

  checkinRecord.events.push(evt);

  if (pendingRecordPersistence) {
    pendingRecordPersistenceIsStale = true;
    return pendingRecordPersistence;
  } else return pendingRecordPersistence = persistRecord();
}

var setupFormElement = document.getElementById('setup-form');
var sboxFileInput = document.getElementById('sbox-file');
var passphraseInput = document.getElementById('passphrase');
var setupButton = document.getElementById('setup-button');

surpass(passphraseInput);

function updateSetupButtonState() {
  setupButton.disabled = !(sboxFileInput.files[0] && passphraseInput.value);
}

// remorselessly copied from https://github.com/dchest/tweetnacl-util-js/blob/master/nacl-util.js
function utf8StringToArrayBuffer (s) {
  if (typeof s !== 'string') throw new TypeError('expected string');
  var i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
  for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
  return b;
}
function arrayBufferToUtf8String(arr) {
  var i, s = [];
  for (i = 0; i < arr.length; i++) s.push(String.fromCharCode(arr[i]));
  return decodeURIComponent(escape(s.join('')));
}

// TODO: move this to a common util script instead of copying it to both pages
function getArrayBufferFromFile(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      return resolve(new Uint8Array(e.target.result));
    };
    reader.readAsArrayBuffer(file);
  });
}

function setupMemberList(decodedDatabase) {
  // nullify inputs that could be used for potential re-entry
  sboxFileInput.value = null;
  passphraseInput.value = '';
  updateSetupButtonState();

  // store data in globals
  checkinRecord.at = decodedDatabase.name;
  memberList = decodedDatabase.members;

  // set up search structure
  fuse = new Fuse(memberList, {
    shouldSort: true,
    tokenize: true,
    threshold: 0.6,
    location: 0,
    distance: 100,
    maxPatternLength: 32,
    keys: ['name']
  });

  return registerEvent({
    type: 'open',
    date: new Date().toISOString()
  });
}

// note that this is called only by the success branch of attemptSetup
// and only after initializeCheckinRecord has completed
function finishSetup() {
  // Resume mode
  if (operator) {
    operator = memberList.find(function(member){
      return member.id == operator});
    registerEvent({
      type: 'restart',
      operator: operator.id,
      date: new Date().toISOString()
    });
  }
  updateOperatorState();

  leaveNoteMode();

  changeMode('signin');
}

function attemptSetup() {
  var passphraseHashData = nacl.hash(
    utf8StringToArrayBuffer(passphraseInput.value));
  var secretKey = passphraseHashData.slice(0, nacl.secretbox.keyLength);
  var secretNonce = passphraseHashData.slice(nacl.secretbox.keyLength,
    nacl.secretbox.keyLength + nacl.secretbox.nonceLength);

  getArrayBufferFromFile(sboxFileInput.files[0]).then(function(boxBuffer) {
    var jsonBuffer = nacl.secretbox.open(boxBuffer, secretNonce, secretKey);
    if (jsonBuffer) {
      setupMemberList(JSON.parse(arrayBufferToUtf8String(jsonBuffer)));
      return recordInitializedPromise.then(finishSetup);
    } else {
      // TODO: do in-page auth failure reporting
      alert('Invalid passphrase');
    }
  });
}

sboxFileInput.addEventListener('change', updateSetupButtonState);
passphraseInput.addEventListener('input', updateSetupButtonState);
setupFormElement.addEventListener('submit', function (evt) {
  evt.preventDefault();
  return attemptSetup();
});

// signin stuff

var memberSearchInput = document.getElementById('member-search');
var topResult = document.getElementById('top-result');
var noResult = document.getElementById('no-result');
var topName = document.getElementById('top-name');
var topDetails = document.getElementById('top-details');
var topDate = document.getElementById('top-date');
var topActionButton = document.getElementById('top-action-button');
var topActionTaken = document.getElementById('top-action-taken');

var noteStartButton = document.getElementById('add-note-button');
var noteModeContainer = document.getElementById('note-mode');
var noteTextArea = document.getElementById('note-content');
var saveNoteButton = document.getElementById('save-note');
var discardNoteButton = document.getElementById('discard-note');

var footerMessage = document.getElementById('footer-message');
var finishButton = document.getElementById('finish-button');

var topDetailsBaseClass = '';
var topDetailsCurrentDuesClass = 'current-dues';
var topDetailsExpiredDuesClass = 'expired-dues';

// TODO: move this to utils, too
function isoDate(date) {
  return new Date(date || Date.now()).toISOString().slice(0,10);
}

function localTime(date) {
  return new Date(date || Date.now()).toLocaleTimeString();
}

function updateOperatorState() {
  memberSearchInput.value = '';
  displayNoMember(true);
  if (operator) {
    footerMessage.textContent = 'Operating as ' + operator.name;
    finishButton.textContent = 'Stop';
    finishButton.hidden = false;
  } else {
    if (checkinRecord.events.length == 0) {
      finishButton.hidden = true;
      footerMessage.textContent =
        'Search for your name above to start signing in';
    } else {
      finishButton.hidden = false;
      footerMessage.textContent = 'Enter a name above to continue, or';
      finishButton.textContent = 'End sign-in';
    }
  }
}

function displayNoMember(expected) {
  topResult.hidden = true;
  noResult.hidden = false;
  noResult.textContent = expected ?
    'Type a member name above to search' :
    'No remotely similar name found in current membership (consult co-chair)';
}

function searchForMatchingMember(memberName) {
  var topMembers = fuse.search(memberName);

  if (topMembers.length > 0) {
    topMember = topMembers[0];
    displayTopMember();
  } else {
    displayNoMember(false);
  }
}

function findSignin(memberId) {
  var signinIndex = lastEventIndexOfTypeForMember('signin', memberId);
  if (signinIndex > -1) {
    var cancelIndex = lastEventIndexOfTypeForMember('cancel', memberId);
    if (cancelIndex < signinIndex) return checkinRecord.events[signinIndex];
    else return null;
  } else return null;
}

function showActionButton(message) {
  topActionTaken.hidden = true;
  topActionButton.textContent = message;
  topActionButton.hidden = false;
}

function showActionTaken(message) {
  topActionButton.hidden = true;
  topActionTaken.textContent = message;
  topActionTaken.hidden = false;
}

function signedInMessage(date) {
  return "Signed in " + localTime(date);
}

function apprisalMessage(date) {
  return "Apprised " + localTime(date);
}

function displayTopMember() {
  noResult.hidden = true;
  topResult.hidden = false;
  topName.textContent = topMember.name;

  var expiryDate = new Date(topMember.expiry);
  if (expiryDate > Date.now()) {
    topDate.textContent = "Current through " + isoDate(expiryDate);
    topDetails.className = topDetailsBaseClass + topDetailsCurrentDuesClass;
    if (operator) {
      if (operator.id == topMember.id) {
        showActionTaken("(This is you)");
      } else {
        var signin = findSignin(topMember.id);
        if (signin) {
          showActionTaken(signedInMessage(signin.date));
        } else {
          showActionButton("Sign in");
        }
      }
    } else {
      showActionButton("This is me");
    }
  } else {
    topDate.textContent = "Dues expired " + isoDate(expiryDate);
    topDetails.className = topDetailsBaseClass + topDetailsExpiredDuesClass;
    if (operator) {
      var priorApprisal =
        lastEventIndexOfTypeForMember('apprisal', topMember.id);
      if (priorApprisal > -1) {
        showActionTaken(
          apprisalMessage(checkinRecord.events[priorApprisal].date));
      } else {
        showActionButton("Apprise");
      }
    } else {
      showActionTaken("(This member should not handle sign-in)");
    }
  }
}

function startTopMemberAsOperator() {
  var now = new Date();
  registerEvent({
    type: 'start',
    operator: topMember.id,
    date: now.toISOString()
  });
  operator = topMember;
  updateOperatorState();
}

// note that this could *theoretically* cause a member who is shown to be in
// good standing in the UI to be invalidated on click, if their dues expired
// *between the search and the button press*. This is considered to be
// unlikely enough for this implementation to be acceptable.
function takeTopMemberAction() {
  // Normal operation
  if (operator) {
    var now = new Date();
    var expiryDate = new Date(topMember.expiry);
    if (expiryDate > now) {
      registerEvent({
        type: 'signin',
        member: topMember.id,
        date: now.toISOString(),
        operator: operator.id
      });
      showActionTaken(signedInMessage(now));
    } else {
      registerEvent({
        type: 'inform',
        member: topMember.id,
        date: now.toISOString(),
        operator: operator.id
      });
      showActionTaken(apprisalMessage(now));
    }

  // Initial operator login
  } else startTopMemberAsOperator();
}

topActionButton.addEventListener('click', takeTopMemberAction);

function enterNoteMode() {
  noteStartButton.hidden = true;
  noteModeContainer.hidden = false;
}

function leaveNoteMode() {
  noteTextArea.value = '';
  noteModeContainer.hidden = true;
  noteStartButton.hidden = false;
}

function recordNote() {
  return registerEvent({
    type: 'note',
    body: noteTextArea.value,
    // we want the ability to take notes if you can't get an operator,
    // so we use a dummy value of 0 which hopefully no member would ever have
    operator: operator ? operator.id : '0',
    date: new Date().toISOString()
  }).then(leaveNoteMode);
}

noteStartButton.addEventListener('click', enterNoteMode);
saveNoteButton.addEventListener('click', recordNote);
discardNoteButton.addEventListener('click', leaveNoteMode);

function closeSignin() {
  return registerEvent({
    type: 'close',
    date: new Date().toISOString()
  }).then(teardownAndEnd);
}

function takeFinishAction() {
  var now = new Date();
  if (operator) {
    registerEvent({
      type: 'stop',
      operator: operator.id,
      date: now.toISOString()
    });
    operator = null;
    updateOperatorState();
  } else {
    return closeSignin();
  }
}

finishButton.addEventListener('click', takeFinishAction);

memberSearchInput.addEventListener('input', function(evt) {
  var searchQuery = memberSearchInput.value;
  if (searchQuery) {
    searchForMatchingMember(searchQuery);
  } else {
    displayNoMember(true);
  }
});

var saveSigninsButton = document.getElementById('save-signins');

function saveSignins() {
  saveAs(new Blob([JSON.stringify(checkinRecord)], {type:'text/json'}),
    isoDate() + '_signins.json', true);
}

saveSigninsButton.addEventListener('click', saveSignins);

function fullyReset() {
  startNewCheckinRecord();
  localforage.removeItem(checkinRecordId).then(changeMode.bind(null, 'setup'));
}

document.getElementById('start-new')
  .addEventListener('click', fullyReset);
document.getElementById('start-new-late')
  .addEventListener('click', fullyReset);
document.getElementById('resume')
  .addEventListener('click', changeMode.bind(null, 'setup'));
document.getElementById('resume-end')
  .addEventListener('click', teardownAndEnd);

})();
