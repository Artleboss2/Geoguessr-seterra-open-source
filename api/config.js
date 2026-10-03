module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ CARTO_API_KEY: process.env.CARTO_API_KEY || '' });
};
