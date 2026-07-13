import app from './index.js';

const PORT = Number(process.env.PORT ?? 5001);

app.listen(PORT, () => {
  console.log(`Gym tracker API listening on port ${PORT}`);
});
