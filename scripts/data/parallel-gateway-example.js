export const PARALLEL_GATEWAY_EXAMPLE_CHOREOGRAPHY = {
  roles: ["Ale", "Fra"],
  nodes: [
    {
      name: "Start",
      nodeType: 0,
      incoming: [],
      outgoing: ["Activity1"],
      conditions: [],
      initiatorRole: "",
      participantRole: "",
      initiatingMessage: "",
      returnMessage: ""
    },
    {
      name: "Activity1",
      nodeType: 2,
      incoming: ["Start"],
      outgoing: ["Parallel Split"],
      conditions: [],
      initiatorRole: "Ale",
      participantRole: "Fra",
      initiatingMessage: "msg1",
      returnMessage: "msg2"
    },
    {
      name: "Parallel Split",
      nodeType: 5,
      incoming: ["Activity1"],
      outgoing: ["Activity2", "Activity3"],
      conditions: [],
      initiatorRole: "",
      participantRole: "",
      initiatingMessage: "",
      returnMessage: ""
    },
    {
      name: "Activity2",
      nodeType: 2,
      incoming: ["Parallel Split"],
      outgoing: ["Parallel Join"],
      conditions: [],
      initiatorRole: "Fra",
      participantRole: "Ale",
      initiatingMessage: "msg3",
      returnMessage: ""
    },
    {
      name: "Activity3",
      nodeType: 2,
      incoming: ["Parallel Split"],
      outgoing: ["Parallel Join"],
      conditions: [],
      initiatorRole: "Fra",
      participantRole: "Ale",
      initiatingMessage: "msg4",
      returnMessage: ""
    },
    {
      name: "Parallel Join",
      nodeType: 6,
      incoming: ["Activity2", "Activity3"],
      outgoing: ["End"],
      conditions: [],
      initiatorRole: "",
      participantRole: "",
      initiatingMessage: "",
      returnMessage: ""
    },
    {
      name: "End",
      nodeType: 1,
      incoming: ["Parallel Join"],
      outgoing: [],
      conditions: [],
      initiatorRole: "",
      participantRole: "",
      initiatingMessage: "",
      returnMessage: ""
    }
  ]
};
