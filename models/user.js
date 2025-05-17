const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: String,
  email: { type: String, unique: true },
  phone: String,
  password: String,
  token: String,
  lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'List' }],
  dateCreation: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
