export const PIZZA_DELIVERY_CHOREOGRAPHY = {
  roles: ["Customer", "Pizza Place", "Delivery Boy"],
  nodes: [
    {
      name: "Start",
      nodeType: 0,
      incoming: [],
      outgoing: ["order pizza"],
      conditions: [],
      initiatorRole: "",
      participantRole: "",
      initiatingMessage: "",
      returnMessage: ""
    },
    {
      name: "order pizza",
      nodeType: 2,
      incoming: ["Start"],
      outgoing: ["hand over pizza"],
      conditions: [],
      initiatorRole: "Customer",
      participantRole: "Pizza Place",
      initiatingMessage: "pizza order",
      returnMessage: ""
    },
    {
      name: "hand over pizza",
      nodeType: 2,
      incoming: ["order pizza"],
      outgoing: ["deliver pizza", "delivery split"],
      conditions: ["", ""],
      initiatorRole: "Pizza Place",
      participantRole: "Delivery Boy",
      initiatingMessage: "",
      returnMessage: ""
    },
    {
      name: "deliver pizza",
      nodeType: 2,
      incoming: ["hand over pizza"],
      outgoing: ["Delivery Complete"],
      conditions: [],
      initiatorRole: "Delivery Boy",
      participantRole: "Customer",
      initiatingMessage: "pizza",
      returnMessage: ""
    },
    {
      name: "Delivery Complete",
      nodeType: 1,
      incoming: ["deliver pizza"],
      outgoing: [],
      conditions: [],
      initiatorRole: "",
      participantRole: "",
      initiatingMessage: "",
      returnMessage: ""
    },
    {
      name: "delivery split",
      nodeType: 5,
      incoming: ["hand over pizza"],
      outgoing: ["notify pizza place"],
      conditions: [],
      initiatorRole: "",
      participantRole: "",
      initiatingMessage: "",
      returnMessage: ""
    },
    {
      name: "notify pizza place",
      nodeType: 2,
      incoming: ["delivery split"],
      outgoing: ["Notification Sent"],
      conditions: [],
      initiatorRole: "Delivery Boy",
      participantRole: "Pizza Place",
      initiatingMessage: "",
      returnMessage: ""
    },
    {
      name: "Notification Sent",
      nodeType: 1,
      incoming: ["notify pizza place"],
      outgoing: [],
      conditions: [],
      initiatorRole: "",
      participantRole: "",
      initiatingMessage: "",
      returnMessage: ""
    }
  ]
};
