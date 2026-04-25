FROM node:20-alpine

WORKDIR /simulator

COPY package.json ./
COPY src ./src

CMD ["sh", "-lc", "touch /tmp/simulator.log && tail -n 0 -F /tmp/simulator.log & exec node src/server.js"]
