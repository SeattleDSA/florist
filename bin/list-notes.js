console.log(JSON.parse(require("fs").readFileSync(process.argv[2]))
  .events.filter(x => x.type == 'note').map(x=>x.body).join('\n'));
