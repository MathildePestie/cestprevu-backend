require('./user'); 
const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  text: String,
  done: Boolean,
  doneBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
});

const listSchema = new mongoose.Schema({
  title: String,
  description: String,
  tasks: [taskSchema],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  membersCanEdit: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("lists", listSchema);