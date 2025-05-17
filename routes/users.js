var express = require('express');
var router = express.Router();
const bcrypt = require('bcrypt');
const uid2 = require('uid2');
const User = require('../models/user');

router.post('/signup', async (req, res) => {
  const { username, email, password, phone } = req.body;

  if (!username || !email || !password) {
    return res.json({ result: false, error: 'Champs manquants' });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.json({ result: false, error: 'Email déjà utilisé' });
  }

  const hash = await bcrypt.hash(password, 10);
  const token = uid2(32);

  const newUser = new User({ username, email, password: hash, token, phone });
  await newUser.save();

  res.json({ result: true, token, id: newUser._id });
});

router.post('/signin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ result: false, error: 'Champs manquants' });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.json({ result: false, error: 'Utilisateur introuvable' });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return res.json({ result: false, error: 'Mot de passe incorrect' });
  }

  res.json({
    result: true,
    token: user.token,
    username: user.username,
    id: user._id.toString(),
  });
});

router.post('/me', async (req, res) => {
  const user = await User.findOne({ token: req.body.token });
  if (!user) return res.json({ result: false, error: 'Utilisateur non trouvé' });

  res.json({
    result: true,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone,
    },
  });
});

router.patch('/update', async (req, res) => {
  const { token, username, email, phone } = req.body;

  const user = await User.findOne({ token });
  if (!user) return res.json({ result: false, error: 'Utilisateur non trouvé' });

  user.username = username || user.username;
  user.email = email || user.email;
  user.phone = phone || user.phone;
  await user.save();

  res.json({ result: true });
});

module.exports = router;
