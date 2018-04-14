# florist

Check-in app for DSA chapter meetings

![Flag of the National Association of Florists With Mismatched Gloves](https://i.redd.it/5tcqkz51cl2z.jpg)

This is an app for meetings of general membership where every member in attendance needs to be recorded and on-boarded (ie. given a voting card and possibly other voting materials, such as a printed copy of each proposed amendment / resolution).

It's better than having a printout of your entire membership-in-good-standing list lying around, or having a sign-in sheet that some random infiltrator could take a picture of and harass membership with as people write down their names.

## setup for event runners

### choosing a passphrase

Come up with a passphrase that'll be shared with everybody who'll be responsible for check-in at the event; something long and memorable that can easily be communicated verbally, like `Chomsky says almost all sentences are original`. (You may want to consider using some form of [diceware][].) You can check how strong your passphrase is based on how long [zxcvbn][tryzxcvbn] says it'd take to crack at 10B guesses / second (offline attack, fast hash, many cores): if it says "centuries", you're gold. If it says a single-digit number of years, you're *probably* OK (the risk is still higher of the membership list leaking some other way); if it's a matter of months, you should probably add another word to it.

[diceware]: https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases
[tryzxcvbn]: https://lowe.github.io/tryzxcvbn/

### encrypting the membership list

Go to xlsx-encoder.html. Choose the Excel spreadsheet you get from National every month, and enter the passphrase you devised earlier. Once you've entered these things, the "Download encrypted database" button should be enabled; click that to save the encrypted file you'll load onto sign-in volunteers' devices.

(Note that "Download" is technically a misnomer, as all of this happens locally to the device with nothing being uploaded *or* downloaded, but "Save encrypted database" wasn't as clear as to what happens when you press the button.)

### distributing the encrypted membership list

You can distribute your membership list by whatever means you consider adequate; my recommendation would be to get a MicroSD card reader like [this one][B072WGBS4B] that has connectors for every smartphone/notebook released in the last 6 years, then using that to transfer the file to any members handling check-in.

[B072WGBS4B]: https://www.amazon.com/Micro-Reader-iPhone-Connector-Lightning/dp/B072WGBS4B/
[B01JOMO5FA]: https://www.amazon.com/gp/product/B01JOMO5FA/

### distributing the passphrase

Distribution the passphrase, like distribution of the encrypted membership list, is an implementation detail left to your own operational structure. Some tips:

- The passphrase **must** be distributed separately from the membership list: if you send the encrypted list as an attachment to an email containing the passphrase, you'd be effectively sending the list unencrypted.
- The passphrase distribution should be as offline as possible. Ideally, it should only be transmitted verbally: if you need to write it down (ie. to avoid eavesdroppers), write it on the arm of someone wearing sleeves, where it'll be out of sight, and can't get lost, and will be destroyed naturally.
- It might not be a bad idea to have the person who encrypted the list handle entering the passphrase into each sign-in device themselves, leaving it so that even the members who were given access to the encrypted file wouldn't be able to decrypt it themselves later.

## using the app for check-in

Once the device for check-ins has loaded the file + passphrase for the membership list, the person doing check-ins should check themselves in as the operator.

As people come in for the meeting, they go to the designated check-in operators, who type the member's name to bring up an entry for them checking if they're in good standing.

If their name isn't showing up, it means they're **not a member of this chapter**, according to the spreadsheet we get from National - they should check with the chapter co-chairs to figure out what's up.

## saving results and closing up (teardown)

After check-in for the meeting has closed (ie. after the meeting), go back around to every member who was given the encrypted list and ensure that they've closed out and deleted any copy of the membership list that may have been loaded onto the device (if it was copied to the device at all). Have them send the sign-in log to the Chapter Secretary by whatever means available (email, Signal, flash drive, whatever).

My dream is that we'd have enough cheap MicroSD cards (should be available in obsolete capacities like 32MB) that it would be feasible to, once checkin has stopped and every volunteer handling check-in has deleted the member list from their devices, the card could then be completely, ritualistically destroyed (ie. ground into dust in a burr grinder like [this][B01JOMO5FA]), but I haven't been able to find a bulk source of MicroSD cards cheap enough to do this yet.
