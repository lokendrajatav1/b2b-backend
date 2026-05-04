const prisma = require('../config/prisma');

const getGlobalSettings = async (req, res) => {
    try {
        let settings = await prisma.globalSettings.findUnique({
            where: { id: 'global' },
        });

        if (!settings) {
            settings = await prisma.globalSettings.create({
                data: { id: 'global' },
            });
        }

        res.status(200).json(settings);
    } catch (error) {
        console.error('Error fetching global settings:', error);
        res.status(500).json({ message: 'Error fetching global settings', error: error.message });
    }
};

const updateGlobalSettings = async (req, res) => {
    try {
        const data = req.body;
        
        let settings = await prisma.globalSettings.upsert({
            where: { id: 'global' },
            update: data,
            create: {
                id: 'global',
                ...data
            }
        });

        res.status(200).json({ message: 'Global settings updated successfully', settings });
    } catch (error) {
        console.error('Error updating global settings:', error);
        res.status(500).json({ message: 'Error updating global settings', error: error.message });
    }
};

module.exports = {
    getGlobalSettings,
    updateGlobalSettings
};
