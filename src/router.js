import { createRouter, createWebHistory } from "vue-router";

const RouteStub = { template: "<div />" };

const routes = [
  { path: "/", name: "tree", component: RouteStub },
  { path: "/myprofile", name: "myprofile", component: RouteStub },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
