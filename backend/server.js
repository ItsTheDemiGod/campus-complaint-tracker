require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/health');
const adminStaffRoutes = require('./routes/adminStaff');
const notifyRoutes = require('./routes/notifyAssignment');
const { startEscalationCron } = require('./jobs/cron');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/admin/staff', adminStaffRoutes);
app.use('/api/notify', notifyRoutes);

startEscalationCron();

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`API listening on :${port}`));
