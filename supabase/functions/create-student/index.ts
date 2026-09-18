import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    // 1. Confirm the caller is actually staff/admin (not just any logged-in user)
    const { data: callerStaff, error: callerErr } = await supabaseAdmin
      .from("staff_accounts")
      .select("id, role")
      .eq("auth_user_id", userClaims.id)
      .single();

    if (callerErr || !callerStaff) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await req.json();
    const {
      firstName, lastName, dob, gender, phone, address, branch,
      department, classSession, examTypes, subjects, regDate, amountPaid,
      paymentDate, guardianName, guardianPhone, eligible, addedBy
    } = body;

    if (!firstName || !lastName) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Generate the next reg no from the real student count (same scheme as before: TT + 27000 + n)
    const { count, error: countErr } = await supabaseAdmin
      .from("students")
      .select("id", { count: "exact", head: true });

    if (countErr) {
      return Response.json({ error: "Could not generate registration number." }, { status: 400 });
    }

    const regNo = "TT" + (27000 + (count ?? 0) + 1);

    const password = lastName.toLowerCase().padEnd(6, "0");
    const email = `${regNo.toLowerCase()}@student.testimonytutorportal.app`;

    // 2. Create the Auth user (admin-only privileged action)
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createErr || !newUser?.user) {
      return Response.json({ error: createErr?.message || "Failed to create login." }, { status: 400 });
    }

    // 3. Insert the student row, linked to the new Auth user
    const { data: studentRow, error: insertErr } = await supabaseAdmin
      .from("students")
      .insert({
        auth_user_id: newUser.user.id,
        reg_no: regNo,
        first_name: firstName,
        last_name: lastName,
        dob: dob || null,
        gender: gender || null,
        phone: phone || null,
        address: address || null,
        branch: branch || null,
        department: department || null,
        class_session: classSession || null,
        exam_types: examTypes || [],
        subjects: subjects || [],
        reg_date: regDate || new Date().toISOString().slice(0, 10),
        amount_paid: amountPaid || 0,
        payment_date: paymentDate || null,
        guardian_name: guardianName || null,
        guardian_phone: guardianPhone || null,
        eligible: eligible ?? false,
        approval_status: "approved",
        added_by: addedBy || "admin"
      })
      .select()
      .single();

    if (insertErr) {
      // Roll back the auth user if the student row failed, so we don't leave an orphaned login
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return Response.json({ error: insertErr.message }, { status: 400 });
    }

    return Response.json({ student: studentRow, password });
  })
};