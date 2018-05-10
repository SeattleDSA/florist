"use strict";

const xlsx = require("xlsx");
const signins = require(process.argv[2]);

const memberList = xlsx.readFile(process.argv[3]);
const memberRows = xlsx.utils.sheet_to_json(
  memberList.Sheets[memberList.SheetNames[0]]);

const nameFields = ['first_name', 'middle_name', 'last_name', 'suffix',
  'family_first_name', 'family_last_name'];

function memberName(row) {
  var nameParts = [];

  // add each present name component, in order
  for (var i = 0; i < nameFields.length; ++i) {
    if (/\S/.test(row[nameFields[i]] || '')) {
      nameParts.push(row[nameFields[i]].trim());
    }
  }

  return nameParts.join(' ');
}


const memberMap = new Map(memberRows.map(r=>[r.AK_id, memberName(r)]));
console.log(signins.events.filter(x=>({signin:true,inform:true}[x.type]))
  .map(x=>memberName(memberMap.get(x.member))));
