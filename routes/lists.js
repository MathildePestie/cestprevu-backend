const express = require("express");
const mongoose = require("mongoose");
console.log("🔍 Modèles enregistrés :", mongoose.modelNames());
const router = express.Router();
const List = require("../models/list");
const User = require("../models/user");

router.post("/create", async (req, res) => {
  const { token, title, description, tasks } = req.body;

  if (!token) {
    return res.json({ result: false, error: "Token manquant dans la requête" });
  }

  const user = await User.findOne({ token });
  if (!user || !user._id) {
    return res.json({
      result: false,
      error: "Utilisateur non trouvé ou ID manquant",
    });
  }

  const newList = new List({
    title,
    description,
    owner: user._id,
    tasks: tasks || [],
  });

  await newList.save();

  user.lists.push(newList._id);
  await user.save();

  console.log("✅ Liste créée :", newList);

  res.json({ result: true, list: newList });
});

router.get("/one/:listId", async (req, res) => {
  const { listId } = req.params;
  console.log("🔍 Appel reçu avec ID:", listId);

  try {
    const list = await List.findById(listId)
      .populate("owner")
      .populate("members")
      .populate("tasks.doneBy");

    if (!list) {
      console.warn("❌ Liste introuvable !");
      return res.json({ result: false, error: "Liste introuvable" });
    }

    console.log("✅ Liste trouvée :", list);
    res.json({ result: true, list });
  } catch (error) {
    console.error("💥 Erreur serveur:", error);
    res.json({ result: false, error: "Erreur serveur" });
  }
});

router.patch("/:listId/add-member", async (req, res) => {
  const { listId } = req.params;
  const { token, email } = req.body;

  const list = await List.findById(listId);
  if (!list) return res.json({ result: false, error: "Liste introuvable" });

  // Vérification que c’est bien l’owner qui ajoute
  const owner = await User.findOne({ token });
  if (!owner || !list.owner.equals(owner._id)) {
    return res.json({
      result: false,
      error: "Accès refusé : seul le créateur peut ajouter un membre.",
    });
  }

  const member = await User.findOne({ email });
  if (!member)
    return res.json({
      result: false,
      error: "Membre introuvable avec cet email.",
    });

  // On évite les doublons
  if (list.members.includes(member._id)) {
    return res.json({
      result: false,
      error: "Ce membre fait déjà partie de la liste.",
    });
  }

  list.members.push(member._id);
  await list.save();

  res.json({ result: true, message: "Membre ajouté avec succès." });
});

router.patch("/:listId/toggle-task/:taskIndex", async (req, res) => {
  const io = req.app.get("socketio");
  const { listId, taskIndex } = req.params;
  const { token } = req.body;

  const list = await List.findById(listId)
    .populate("owner")
    .populate("members")
    .populate("tasks.doneBy");

  if (!list) return res.json({ result: false, error: "Liste introuvable" });

  const user = await User.findOne({ token });
  if (!user)
    return res.json({ result: false, error: "Utilisateur introuvable" });

  const isOwner = list.owner._id.equals(user._id);
  const isMember = list.members.some((m) => m._id.equals(user._id));
  const canEdit = isOwner || (isMember && list.membersCanEdit);

  if (!canEdit) {
    return res.json({
      result: false,
      error: "Tu n'as pas les droits pour modifier cette liste.",
    });
  }

  const task = list.tasks[taskIndex];
  if (!task) return res.json({ result: false, error: "Tâche introuvable" });

  task.done = !task.done;
  task.doneBy = task.done ? user._id : null;

  await list.save();

  const updatedList = await List.findById(listId)
    .populate("owner")
    .populate("members")
    .populate("tasks.doneBy");

  io.to(listId).emit("listUpdated", updatedList);
  res.json({ result: true, list: updatedList });
});

router.patch("/:listId", async (req, res) => {
  const io = req.app.get("socketio");
  const { listId } = req.params;
  const { token, title, description, tasks, membersCanEdit } = req.body;

  const list = await List.findById(listId)
    .populate("owner")
    .populate("members");
  if (!list) return res.json({ result: false, error: "Liste introuvable" });

  const user = await User.findOne({ token });
  if (!user)
    return res.json({ result: false, error: "Utilisateur introuvable" });

  if (membersCanEdit !== undefined) list.membersCanEdit = membersCanEdit;

  const isOwner = list.owner._id.equals(user._id);
  const isMember = list.members.some((member) => member._id.equals(user._id));
  const canEdit = isOwner || (isMember && list.membersCanEdit);

  if (!canEdit) {
    return res.json({
      result: false,
      error: "Tu n'as pas les droits pour modifier cette liste.",
    });
  }

  if (title !== undefined) list.title = title;
  if (description !== undefined) list.description = description;
  if (tasks !== undefined) list.tasks = tasks;

  await list.save();
  io.to(listId).emit("listUpdated", list);
  res.json({ result: true, list });
});

router.delete("/:listId", async (req, res) => {
  const io = req.app.get("socketio");
  const { listId } = req.params;

  const deletedList = await List.findByIdAndDelete(listId);
  if (!deletedList)
    return res.json({ result: false, error: "Liste introuvable" });

  io.to(listId).emit("listUpdated", { deleted: true, _id: listId });
  res.json({ result: true });
});

router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  const lists = await List.find({
    $or: [{ owner: userId }, { members: userId }],
  })
    .sort({ createdAt: -1 })
    .populate("owner");

  res.json({ result: true, lists });
});

// PATCH /lists/:listId/remove-member
router.patch("/:listId/remove-member", async (req, res) => {
  const { listId } = req.params;
  const { token, memberId } = req.body;

  const list = await List.findById(listId);
  if (!list) {
    return res.json({ result: false, error: "Liste introuvable" });
  }

  const owner = await User.findOne({ token });
  if (!owner || !list.owner.equals(owner._id)) {
    return res.json({
      result: false,
      error: "Seul le créateur peut retirer un membre.",
    });
  }

  list.members = list.members.filter(
    (member) => member.toString() !== memberId
  );

  await list.save();

  res.json({ result: true, message: "Membre supprimé avec succès.", list });
});

router.patch("/:listId/add-member-phone", async (req, res) => {
  const { listId } = req.params;
  const { token, phone } = req.body;

  const list = await List.findById(listId);
  if (!list) return res.json({ result: false, error: "Liste introuvable" });

  const owner = await User.findOne({ token });
  if (!owner || !list.owner.equals(owner._id)) {
    return res.json({
      result: false,
      error: "Seul le créateur peut ajouter un membre.",
    });
  }

  const member = await User.findOne({ phone });
  if (!member)
    return res.json({
      result: false,
      error: "Aucun utilisateur trouvé avec ce numéro.",
    });

  if (list.members.includes(member._id)) {
    return res.json({
      result: false,
      error: "Ce membre est déjà dans la liste.",
    });
  }

  list.members.push(member._id);
  await list.save();

  res.json({ result: true, message: "Membre ajouté avec succès." });
});


module.exports = router;
