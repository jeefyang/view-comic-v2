// server/routes/api.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { readConfig, writeConfig } from '../utils/config.js';


const router: Router = Router();
// GET /api/config —— 获取初始化状态
router.get('/config', (_req, res) => {
  try {
    const config = readConfig();
    res.json({
      initialized: config.initialized,
      username: config.username
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read config' });
  }
});

// POST /api/config/init —— 初始化用户
router.post('/config/init', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required (strings)' });
    }

    const config = readConfig();
    if (config.initialized) {
      return res.status(400).json({ error: 'Already initialized' });
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    writeConfig({
      username: username.trim(),
      passwordHash,
      initialized: true
    });

    res.json({ success: true, message: 'Initialized successfully' });
  } catch (err) {
    console.error('Init error:', err);
    res.status(500).json({ error: 'Initialization failed' });
  }
});

// POST /api/config/update-password —— 更新密码
router.post('/config/update-password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const config = readConfig();

    if (!config.initialized) {
      return res.status(400).json({ error: 'Not initialized' });
    }

    const isValid = await bcrypt.compare(oldPassword, config.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid old password' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    writeConfig({ ...config, passwordHash: newPasswordHash });

    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

export default router;