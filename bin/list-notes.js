console.log(require(process.argv[2])
  .events.filter(x => x.type == 'note').join('\n'));
