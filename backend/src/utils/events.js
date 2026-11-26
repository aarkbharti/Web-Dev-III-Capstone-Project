// Shared EventEmitter: controllers announce what happened, the socket layer decides who to tell.
const EventEmitter = require('events');
module.exports = new EventEmitter();
