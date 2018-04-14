/* global Fuse nacl localStorage Blob saveAs */
(function(){
"use strict";

var memberList;

var fuse;

var operator;
var topMember;

var registry;
var registryId = 'currentMeetingEventLog';

var modeContainers = {
  setup: document.getElementById('setup-mode'),
  lookup: document.getElementById('lookup-mode'),
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
  for (var i = registry.length - 1; i > -1; --i) {
    if (registry[i].type == eventType) return i;
  }
  return -1;
}

function lastEventIndexOfTypeForMember(eventType, memberId) {
  for (var i = registry.length - 1; i > -1; --i) {
    if (registry[i].type == eventType &&
      registry[i].member == memberId) return i;
  }
  return -1;
}

registry = localStorage.getItem(registryId);
if (registry) {
  registry = JSON.parse(registry);
  var lastOpenIndex = lastEventIndexOfType('open');
  var lastCloseIndex = lastEventIndexOfType('close');
  if (lastCloseIndex > lastOpenIndex) {
    if (new Date(registry[lastCloseIndex].date) > Date.now() - 86400000) {
      teardownAndEnd();
    } else {
      changeMode('late-end');
    }
  } else {
    // TODO: display note that there is an unfinished meeting in progress

    // Signal to load operator after setup
    operator = registry[lastOpenIndex].operator;
  }
} else {
  registry = [];
}

// setup stuff

function setupSearch() {
  fuse = new Fuse(memberList, {
    shouldSort: true,
    tokenize: true,
    threshold: 0.6,
    location: 0,
    distance: 100,
    maxPatternLength: 32,
    keys: ['name']
  });
}

var setupFormElement = document.getElementById('setup-form');
var sboxFileInput = document.getElementById('sbox-file');
var passphraseInput = document.getElementById('passphrase');
var setupButton = document.getElementById('setup-button');

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

function finishSetup() {
  // burn the way in
  sboxFileInput.value = null;
  passphraseInput.value = '';
  updateSetupButtonState();

  setupSearch();

  // Resume mode
  if (operator) {
    operator = memberList.find(function(member){
      return member.id == operator});
    registerEvent({
      type: 'resume',
      operator: operator.id,
      date: new Date().toISOString()
    });
  }
  updateOperatorState();

  changeMode('lookup');
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
      memberList = JSON.parse(arrayBufferToUtf8String(jsonBuffer));
      return finishSetup();
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
var footerMessage = document.getElementById('footer-message');
var finishButton = document.getElementById('finish-button');

var topDetailsBaseClass = '';
var topDetailsCurrentDuesClass = 'current-dues';
var topDetailsExpiredDuesClass = 'expired-dues';

function registerEvent(evt) {
  registry.push(evt);
  localStorage.setItem(registryId, JSON.stringify(registry));
}

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
    if (registry.length == 0) {
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
    if (cancelIndex < signinIndex) return registry[signinIndex];
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

function refusedMessage(date) {
  return "Informed " + localTime(date);
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
      var priorRefusal =
        lastEventIndexOfTypeForMember('refusal', topMember.id);
      if (priorRefusal > -1) {
        showActionTaken(refusedMessage(registry[priorRefusal].date));
      } else {
        showActionButton("Inform");
      }
    } else {
      showActionTaken("(This member should not handle sign-in)");
    }
  }
}

function openTopMemberAsOperator() {
  var now = new Date();
  registerEvent({
    type: 'open',
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
        type: 'refusal',
        member: topMember.id,
        date: now.toISOString(),
        operator: operator.id
      });
      showActionTaken(refusedMessage(now));
    }

  // Initial operator login
  } else openTopMemberAsOperator();
}

topActionButton.addEventListener('click', takeTopMemberAction);

// ending stuff

var finalJsonTextarea = document.getElementById('final-json');

function teardownAndEnd() {
  // Wipe dangling pointers to sensitive data
  memberList = null;
  fuse = null;
  // Wipe these too, just for good measure
  operator = null;
  topMember = null;
  // write out our fallback / inspection stuff
  finalJsonTextarea.value = JSON.stringify(registry, null, 2);
  changeMode('end');
}

function takeFinishAction() {
  var now = new Date();
  if (operator) {
    registerEvent({
      type: 'close',
      operator: operator.id,
      date: now.toISOString()
    });
    operator = null;
    updateOperatorState();
  } else {
    teardownAndEnd();
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
  saveAs(new Blob([JSON.stringify(registry)], {type:'text/json'}),
    isoDate() + '_signins.json', true);
}

saveSigninsButton.addEventListener('click', saveSignins);

function fullyReset() {
  localStorage.removeItem(registryId);
  registry = [];
  changeMode('setup');
}


document.getElementById('start-new')
  .addEventListener('click', fullyReset);
document.getElementById('start-new-late')
  .addEventListener('click', fullyReset);
document.getElementById('resume')
  .addEventListener('click', changeMode.bind(null,'lookup'));
document.getElementById('resume-end')
  .addEventListener('click', teardownAndEnd);

})();
