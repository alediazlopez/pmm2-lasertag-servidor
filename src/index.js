const path = require("path");
const express = require("express");
const cors = require("cors");
const app = express();
const server = require("http").Server(app);
const mqtt = require("mqtt");
const WebSocketServer = require("websocket").server;
const WebSocket = require("ws");

const wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false,
});

// Tiempo en ms que entre comprobaciones de conexion
const RECONNECTION_TIME = 10000;

var connectedDevices = [];
var devices = [];
var requestLoop;
var setting_teams = false;

if (!setting_teams) {
  setRequestLoop();
} else {
  clearInterval(requestLoop);
}

app.set("port", 3000);
app.use(cors());
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "./public/")));
app.set("views", path.join(__dirname, "./public/views/"));

app.get("/", (req, res) => {
  const data = {
    setting_teams: setting_teams,
  };
  res.render("index", data);
});

wsServer.on("request", (request) => {
  const connection = request.accept(null, request.origin);
  connection.on("message", (message) => {
    console.log("Mensaje recibido: " + message.utf8Data);
    let m = JSON.parse(message.utf8Data);

    // Reenviamos los mensajes enviados por el servidor al cliente.
    if (m["sender"] === "server") {
      wsServer.connections.forEach(function each(client) {
        // WARNING: Esta linea (if) podria estar mal, hay que tenerla en cuenta
        if (client !== connection) {
          client.sendUTF(message.utf8Data);
        }
      });
    } else {
      if (m["type"] === "redirect") {
        switch (m["content"]) {
          case "teamSelect":
            clearInterval(requestLoop);
            setting_teams = true;
            break;
          case "devicesScreen":
            setRequestLoop();
            setting_teams = false;
            break;
          default:
            break;
        }
        reloadClient();
      }
      if (m["type"] === "fetch") {
        if (setting_teams) {
          redirectClient("teamSelect");
        } else {
          redirectClient("devicesScreen");
        }
      }
    }
  });
  connection.on("close", (reasonCode, description) => {
    console.log("El cliente se desconecto");
  });
});

function reloadClient() {
  let message_r = {};
  message_r["type"] = "reload";
  message_r["sender"] = "server";
  ws.send(JSON.stringify(message_r));
}

function redirectClient(destination) {
  let message = {};
  message["type"] = "redirect";
  message["sender"] = "server";
  let content = {};
  content["destination"] = destination;
  content["devices"] = devices;
  message["content"] = content;
  ws.send(JSON.stringify(message));
}

function setConnectedDevices() {
  let message = {};
  message["type"] = "devices";
  message["sender"] = "server";
  message["content"] = connectedDevices;
  ws.send(JSON.stringify(message));
  devices = connectedDevices;
  connectedDevices = [];
}

// Aqui empieza la parte de MQTT

const ws = new WebSocket("ws://10.3.141.1:3000");
const protocol = "mqtt";
const host = "localhost";
const port = "1883";
const clientId = "mqtt_" + Math.random().toString(16).slice(3);

const connectUrl = protocol + "://" + host + ":" + port;

const connectTopic = "Connections/Connect";
const reconnectTopic = "Connections/Reconnect";

const mqttClient = mqtt.connect(connectUrl, {
  clientId,
  clean: true,
  connectTimeout: 400,
  reconnectPeriod: 1000,
});

mqttClient.on("connect", () => {
  console.log("Connected to mqtt");

  mqttClient.subscribe([reconnectTopic], () => {
    console.log("Subscribe to topic " + reconnectTopic);
  });
});

mqttClient.on("message", (topic, payload) => {
  console.log("Mensaje MQTT Recibido:", topic, payload.toString());
  connectedDevices.push(payload.toString());
});

function setRequestLoop() {
  requestLoop = setInterval(checkConnectionDevices, RECONNECTION_TIME);
}

function checkConnectionDevices() {
  mqttClient.publish(connectTopic, "Connect");
  setTimeout(setConnectedDevices, RECONNECTION_TIME / 2);
}

// Iniciamos el servidor en el puerto establecido por la variable port (3000)
server.listen(app.get("port"), () => {
  console.log("Servidor iniciado en el puerto: " + app.get("port"));
});
