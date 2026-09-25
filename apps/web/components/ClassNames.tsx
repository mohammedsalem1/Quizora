import { Fragment } from "react";
import type { ClassRef } from "@/lib/types";

// "10A، 10B": each name isolated on its own, so a list of Latin names still reads right to
// left in order, with the Arabic comma on the correct side.
export function ClassNames({ classes }: { classes: ClassRef[] }) {
  return classes.map((c, i) => (
    <Fragment key={c.id}>
      {i > 0 && "، "}
      <bdi>{c.name}</bdi>
    </Fragment>
  ));
}
