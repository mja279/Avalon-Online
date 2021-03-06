/* eslint-disable no-empty-function */
/* eslint-disable no-unused-vars */
const db = require("../models");
const passport = require("../config/passport");
const { GameState } = require("../config/gameSession");
const { Op: Op } = require("sequelize");
const isAuthenticated = require("../config/middleware/isAuthenticated.js");

module.exports = function(app, sessionManager) {
  // GET Route -- game/run
  app.get("/api/game/:lobbyCode/run", isAuthenticated, (req, res) => {
    // If session isn't created then create session
    if (
      !sessionManager.sessionDictionary[req.params.lobbyCode] ||
      Object.keys(sessionManager.sessionDictionary[req.params.lobbyCode])
        .length === 0
    ) {
      let customSettings = {};
      if (req.body.customSettings) {
        customSettings = req.body.customSettings;
      }

      // Load the lobby's users
      db.Lobby.findOne({
        where: { idhash: req.params.lobbyCode }
      })
        .then(lobby => {
          db.User.findAll({
            where: {
              id: {
                [Op.in]: lobby.userhash.split(",").map(id => Number(id))
              }
            }
          })
            .then(userArray => {
              sessionManager.createSession(
                req.params.lobbyCode,
                userArray,
                customSettings
              );
              const session =
                sessionManager.sessionDictionary[req.params.lobbyCode];
              const initState = new GameState(session);
              db.User.findOne({
                where: {
                  email: req.user.email
                }
              })
                .then(reqUser => {
                  session.revealCharacterInfo();
                  return res.json(initState.getPhaseInfo(reqUser));
                })
                .catch(err => {
                  console.log("Error: " + err.message);
                  res.json(err);
                });
            })
            .catch(err => {
              console.log("Error: " + err.message);
              res.json(err);
            });
        })
        .catch(err => {
          console.log("Error: " + err.message);
          res.json(err);
        });
    }
    // If lobby already exists
    else {
      // Get ssion and state
      const session = sessionManager.sessionDictionary[req.params.lobbyCode];
      const initState = new GameState(session);
      db.User.findOne({
        where: {
          email: req.user.email
        }
      })
        .then(reqUser => {
          return res.status(202).json(initState.getPhaseInfo(reqUser));
        })
        .catch(err => {
          console.log("Error: " + JSON.stringify(err));
          return res.json(err);
        });
    }
  });

  // POST Route -- game/validVote
  app.post("/api/game/:lobbyCode/validVote", isAuthenticated, (req, res) => {
    if (!req.body.vote || Math.abs(req.body.vote) !== 1) {
      return res.status(403).json("Vote of 1 or -1 required");
    }
    console.log("Valid vote cast");

    const currentSession =
      sessionManager.sessionDictionary[req.params.lobbyCode];
    const currentUser = req.user;
    currentSession.setUserVote_ValidParty(currentUser, req.body.vote);
    return res.status(202).json("Success");
  });

  // POST Route -- game/passVote
  app.post("/api/game/:lobbyCode/passVote", isAuthenticated, (req, res) => {
    if (!req.body.vote || Math.abs(req.body.vote) !== 1) {
      return res.status(403).json("Vote of 1 or -1 required");
    }
    console.log("Pass vote cast");

    const currentSession =
      sessionManager.sessionDictionary[req.params.lobbyCode];
    const currentUser = req.user;
    currentSession.setUserVote_PassParty(currentUser, req.body.vote);
    return res.status(202).json(new GameState(currentSession).getPhaseInfo());
  });

  // POST Route -- game/partySelection
  app.post(
    "/api/game/:lobbyCode/partySelection",
    isAuthenticated,
    (req, res) => {
      // If no user array is passed
      if (!req.body.userArray) {
        return res.status(402).json("Users must be selected for the party");
      }
      console.log("Party selection cast");

      const currentSession =
        sessionManager.sessionDictionary[req.params.lobbyCode];
      const userArray = Array.from(currentSession.users);
      // eslint-disable-next-line prettier/prettier
      const partyArray = userArray.filter(user => req.body.userArray.includes(user.id) );
      currentSession.setPartySelection(partyArray);
      return res.json(new GameState(currentSession).getPhaseInfo(req.user));
    }
  );

  // GET Route -- game/state
  app.post("/api/game/:lobbyCode/state", isAuthenticated, (req, res) => {
    const cache = req.body.cache;
    const currentSession =
      sessionManager.sessionDictionary[req.params.lobbyCode];
    if (!cache) {
      return res
        .status(202)
        .json(new GameState(currentSession).getPhaseInfo(req.user));
    } else if (currentSession.stateCacheNeedsUpdate(cache)) {
      return res
        .status(202)
        .json(new GameState(currentSession).getPhaseInfo(req.user));
    }

    return res.status(202).json("Up to date");
  });

  // GET Route -- game/users
  app.get("/api/game/:lobbyCode/users", isAuthenticated, (req, res) => {
    const currentSession =
      sessionManager.sessionDictionary[req.params.lobbyCode];
    return res.status(202).json(currentSession.users);
  });
};
