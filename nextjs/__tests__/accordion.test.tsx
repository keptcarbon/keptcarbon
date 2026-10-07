import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Accordion } from "@/app/(main)/(protected)/my-plots/Accordion";

let mounts = 0;
function Counter() {
  const [n, setN] = useState(0);
  useState(() => { mounts += 1; });
  return <button onClick={() => setN(n + 1)}>count {n}</button>;
}

function finishTransition(container: HTMLElement) {
  fireEvent.transitionEnd(container.firstChild as HTMLElement, { propertyName: "grid-template-rows" });
}

describe("Accordion", () => {
  it("unmounts content after closing by default", () => {
    mounts = 0;
    const { container, rerender } = render(<Accordion open><Counter /></Accordion>);
    fireEvent.click(screen.getByText("count 0"));
    rerender(<Accordion open={false}><Counter /></Accordion>);
    finishTransition(container);
    expect(screen.queryByText(/count/)).toBeNull();
    rerender(<Accordion open><Counter /></Accordion>);
    expect(screen.getByText("count 0")).toBeTruthy();
    expect(mounts).toBe(2);
  });

  it("keepMounted: not mounted until first open, then keeps state across close/reopen", () => {
    mounts = 0;
    const { container, rerender } = render(<Accordion open={false} keepMounted><Counter /></Accordion>);
    expect(mounts).toBe(0);

    rerender(<Accordion open keepMounted><Counter /></Accordion>);
    fireEvent.click(screen.getByText("count 0"));
    rerender(<Accordion open={false} keepMounted><Counter /></Accordion>);
    finishTransition(container);
    // Still mounted while closed, but inert so its controls can't be focused.
    expect(screen.getByText("count 1").closest("[inert]")).toBeTruthy();

    rerender(<Accordion open keepMounted><Counter /></Accordion>);
    expect(screen.getByText("count 1").closest("[inert]")).toBeNull();
    expect(mounts).toBe(1);
  });
});
